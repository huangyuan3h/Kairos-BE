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
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import random
import time

import pandas as pd  # type: ignore[import]

from core.data_collector.calendar import is_trading_day, last_trading_day
from core.data_collector.stock.daily_quotes import build_cn_stock_quotes_df
from core.data_collector.stock.sync import build_cn_sync_plans
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
        full_backfill_years = int(os.getenv("FULL_BACKFILL_YEARS", "3"))
        max_concurrency = int(os.getenv("MAX_CONCURRENCY", "16"))
        shard_total = int(os.getenv("SHARD_TOTAL", "1"))
        shard_index = int(os.getenv("SHARD_INDEX", "0"))
        catch_up_max_days = int(os.getenv("CATCH_UP_MAX_DAYS", "60")) if os.getenv("CATCH_UP_MAX_DAYS") else None
        catch_up_max_years = int(os.getenv("CATCH_UP_MAX_YEARS", "0")) if os.getenv("CATCH_UP_MAX_YEARS") else None

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
        # Optional sharding by stable hash
        if shard_total > 1:
            def _shard_ok(sym: str) -> bool:
                h = int(hashlib.md5(sym.encode("utf-8")).hexdigest(), 16)
                return (h % shard_total) == shard_index
            symbols = [s for s in symbols if _shard_ok(s)]

        if not symbols:
            logger.info("No CN A-share symbols available after sharding; nothing to ingest")
            return {"statusCode": 200, "body": json.dumps({"total_rows": 0, "results": [], "skipped": True})}

        today = _today()
        is_td = is_trading_day("CN", today)

        # Determine latest trading day and build plans only if behind
        last_td = last_trading_day("CN", today)
        plans = build_cn_sync_plans(
            symbols=symbols,
            get_latest_quote_date=stocks.get_latest_quote_date,
            last_trading_day=last_td,
            today=today,
            full_backfill_years=full_backfill_years,
            initial_only=not is_td,
            catch_up_max_days=catch_up_max_days,
            catch_up_max_years=catch_up_max_years,
        )

        total_rows = 0
        results: List[Dict[str, Any]] = []

        def _process(sym: str, start: date) -> Dict[str, Any]:
            try:
                # Small jitter to avoid thundering herd on upstream
                time.sleep(random.uniform(0.05, 0.25))
                df_local = build_cn_stock_quotes_df(sym, start=start, end=today)
                if df_local is None or df_local.empty:
                    return {"symbol": sym, "ingested": 0}
                cnt = stocks.upsert_quotes_df(df_local.copy())
                return {"symbol": sym, "ingested": cnt, "start": str(start), "end": str(today)}
            except Exception as e:
                logger.exception("symbol %s failed: %s", sym, e)
                return {"symbol": sym, "ingested": 0, "error": str(e)}

        with ThreadPoolExecutor(max_workers=max_concurrency) as executor:
            future_map = {executor.submit(_process, p["symbol"], p["start"]): p for p in plans}
            for fut in as_completed(future_map):
                res = fut.result()
                total_rows += int(res.get("ingested", 0))
                results.append(res)

        return {"statusCode": 200, "body": json.dumps({"total_rows": total_rows, "results": results})}
    except Exception as exc:
        logger.exception("Ingest CN stocks failed: %s", exc)
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}


