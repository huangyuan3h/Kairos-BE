"""
Lambda: Sync P0 main indexes/ETFs daily quotes with 3-year backfill and gap-filling.

Sources:
- CN indexes via Akshare
- US indexes/ETFs and VIX via yfinance

Idempotency & incremental logic:
- For each symbol, read latest stored quote date from DynamoDB (if any)
- Set fetch start = max(today - 3y, latest_date + 1 day)
- Fetch [start, today] and upsert by pk/sk (overwrite semantics)

Env:
- MARKET_DATA_TABLE (default: MarketData)
- AWS_REGION (optional)
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta
from typing import Any, Dict, Optional, List

import pandas as pd  # type: ignore[import]

from core.data_collector.index.quotes import build_quotes_df, get_index_source_mapping
from core.database import IndexData, MarketData

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _today() -> date:
    return date.today()


def _three_years_ago(d: date) -> date:
    try:
        return d.replace(year=d.year - 3)
    except ValueError:
        # Handle Feb 29
        return d - timedelta(days=365 * 3)


def _next_day(iso_date: str) -> date:
    y, m, d = iso_date.split("-")
    return date(int(y), int(m), int(d)) + timedelta(days=1)


def ensure_df(df: Optional[pd.DataFrame]) -> pd.DataFrame:
    return df if (df is not None) else pd.DataFrame()


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        index_table = os.getenv("INDEX_DATA_TABLE", "IndexData")
        market_table = os.getenv("MARKET_DATA_TABLE", "MarketData")
        region = os.getenv("AWS_REGION")
        idx_service = IndexData(table_name=index_table, region=region)
        cat_service = MarketData(table_name=market_table, region=region)

        # Prefer dynamic supported list from MarketData catalog
        # Indexes: market=INDEX, asset_type=index, status=active
        idx_df = cat_service.query_stock_catalog_df(
            asset_type="index", market="INDEX", status="active", columns=["symbol"]
        )
        # ETFs: market=US (current P0), asset_type=etf, status=active
        etf_df = cat_service.query_stock_catalog_df(
            asset_type="etf", market="US", status="active", columns=["symbol"]
        )
        symbols_dynamic = set(pd.concat([idx_df, etf_df], ignore_index=True)["symbol"].astype(str).tolist()) if not (idx_df.empty and etf_df.empty) else set()

        # Fallback to static mapping if dynamic list is empty
        mapping = get_index_source_mapping()
        mapping_symbols = set(mapping.keys())
        symbols = list((symbols_dynamic & mapping_symbols) if symbols_dynamic else mapping_symbols)

        # No symbols available → skip execution
        if not symbols:
            logger.info("No supported index/ETF symbols found; skipping sync run")
            return {"statusCode": 200, "body": json.dumps({"total_rows": 0, "results": [], "skipped": True, "reason": "no symbols"})}

        today = _today()
        default_start = _three_years_ago(today)

        total_rows = 0
        results: List[Dict[str, Any]] = []

        for symbol in symbols:
            latest = idx_service.get_latest_quote_date(symbol)
            start = default_start if latest is None else max(default_start, _next_day(latest))
            if start > today:
                logger.info("%s up-to-date; no fetch needed", symbol)
                results.append({"symbol": symbol, "ingested": 0, "skipped": True})
                continue

            df = ensure_df(build_quotes_df(symbol, start=start, end=today))
            if df.empty:
                logger.info("%s no data fetched for range %s to %s", symbol, start, today)
                results.append({"symbol": symbol, "ingested": 0})
                continue

            # Add ingested_at for traceability
            df = df.copy()
            df["ingested_at"] = pd.Timestamp.utcnow().isoformat()

            count = idx_service.upsert_quotes_df(df)
            total_rows += count
            logger.info("%s upserted rows: %d (range %s -> %s)", symbol, count, start, today)
            results.append({"symbol": symbol, "ingested": count, "start": str(start), "end": str(today)})

        body = {"total_rows": total_rows, "results": results}
        return {"statusCode": 200, "body": json.dumps(body)}
    except Exception as exc:
        logger.exception("Sync index quotes failed: %s", exc)
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}


