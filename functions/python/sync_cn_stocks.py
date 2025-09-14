"""
Lambda: Ingest CN A-shares daily OHLCV using Akshare.

Behavior
--------
- Symbol universe: prefer MarketData catalog (market=CN_A, asset_type=stock, status=active).
  Fallback: fetch from Akshare spot API on-the-fly.
- Backfill window: last N days (env BACKFILL_DAYS, default 5). If data exists,
  start from latest_date + 1 day.
- Idempotent upserts: overwrite by pk/sk.

Env
---
- STOCK_DATA_TABLE (required)
- MARKET_DATA_TABLE (required)
- AWS_REGION (optional)
- BACKFILL_DAYS (optional, default 5)
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd  # type: ignore[import]

from core.data_collector.calendar import is_trading_day
from core.data_collector.stock.daily_quotes import build_cn_stock_quotes_df
from core.data_collector.stock.cn_stock_catalog import get_cn_a_stock_catalog
from core.database import MarketData, StockData


logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _today() -> date:
    as_of = os.getenv("AS_OF_DATE")
    if as_of:
        try:
            y, m, d = as_of.split("-")
            return date(int(y), int(m), int(d))
        except Exception:
            pass
    return date.today()


def _next_day(iso_date: str) -> date:
    y, m, d = iso_date.split("-")
    return date(int(y), int(m), int(d)) + timedelta(days=1)


def _backfill_start(today: date, latest: Optional[str], window_days: int) -> date:
    default_start = today - timedelta(days=window_days)
    if latest is None:
        return default_start
    return max(default_start, _next_day(latest))


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        stock_table = os.getenv("STOCK_DATA_TABLE", "StockData")
        market_table = os.getenv("MARKET_DATA_TABLE", "MarketData")
        region = os.getenv("AWS_REGION")
        backfill_days = int(os.getenv("BACKFILL_DAYS", "5"))

        stocks = StockData(table_name=stock_table, region=region)
        catalog = MarketData(table_name=market_table, region=region)

        # Prefer catalog from MarketData
        cat_df = catalog.query_stock_catalog_df(
            asset_type="stock", market="CN_A", status="active", columns=["symbol"]
        )
        if cat_df is None or cat_df.empty:
            # Fallback to Akshare spot universe
            spot = get_cn_a_stock_catalog()
            cat_df = spot[["symbol"]] if spot is not None else pd.DataFrame(columns=["symbol"])

        symbols: List[str] = (
            cat_df["symbol"].astype(str).dropna().drop_duplicates().tolist() if not cat_df.empty else []
        )
        if not symbols:
            logger.info("No CN A-share symbols available; nothing to ingest")
            return {"statusCode": 200, "body": json.dumps({"total_rows": 0, "results": [], "skipped": True})}

        today = _today()
        if not is_trading_day("CN", today):
            logger.info("%s is not a CN trading day; skipping run", today)
            return {"statusCode": 200, "body": json.dumps({"total_rows": 0, "results": [], "skipped": True, "reason": "non-trading"})}  # noqa: E501

        # Build plans per symbol
        plans: List[Dict[str, Any]] = []
        for sym in symbols:
            latest = stocks.get_latest_quote_date(sym)
            start = _backfill_start(today, latest, backfill_days)
            if start > today:
                continue
            plans.append({"symbol": sym, "start": start})

        total_rows = 0
        results: List[Dict[str, Any]] = []
        for p in plans:
            sym = p["symbol"]
            start = p["start"]
            df = build_cn_stock_quotes_df(sym, start=start, end=today)
            if df is None or df.empty:
                results.append({"symbol": sym, "ingested": 0})
                continue
            df = df.copy()
            df["ingested_at"] = pd.Timestamp.utcnow().isoformat()
            count = stocks.upsert_quotes_df(df)
            total_rows += count
            results.append({"symbol": sym, "ingested": count, "start": str(start), "end": str(today)})

        return {"statusCode": 200, "body": json.dumps({"total_rows": total_rows, "results": results})}
    except Exception as exc:
        logger.exception("Ingest CN stocks failed: %s", exc)
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}


