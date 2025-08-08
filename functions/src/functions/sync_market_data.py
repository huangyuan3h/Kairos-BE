"""
Lambda: Sync main MarketData catalog for CN & US equities.

- CN: fetched via core.data_collector.stock.cn_stock_catalog.get_cn_a_stock_catalog
- US: fetched via core.data_collector.stock.us_stock_catalog.get_us_stock_catalog

Environment variables
---------------------
- MARKET_DATA_TABLE: DynamoDB table name (defaults to "MarketData")
- AWS_REGION: AWS region (optional)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

import pandas as pd  # type: ignore[import]

from core.data_collector.stock.cn_stock_catalog import get_cn_a_stock_catalog
from core.data_collector.stock.us_stock_catalog import get_us_stock_catalog
from core.database import MarketData

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Lambda handler to sync CN & US stock catalogs into DynamoDB.

    Returns counts per market and overall.
    """
    try:
        table_name = os.getenv("MARKET_DATA_TABLE", "MarketData")
        region = os.getenv("AWS_REGION")
        service = MarketData(table_name=table_name, region=region)

        # CN A-shares
        cn_df = get_cn_a_stock_catalog() or pd.DataFrame(columns=["symbol", "name", "exchange", "asset_type", "market", "status"])  # type: ignore[no-untyped-call]
        cn_count = int(service.upsert_stock_catalog(cn_df)) if not cn_df.empty else 0
        logger.info("Upserted CN catalog items: %d", cn_count)

        # US listings from NASDAQ Trader directories
        us_df = get_us_stock_catalog()
        us_count = int(service.upsert_stock_catalog(us_df)) if not us_df.empty else 0
        logger.info("Upserted US catalog items: %d", us_count)

        total = cn_count + us_count
        body = {"cn": cn_count, "us": us_count, "total": total}
        return {"statusCode": 200, "body": json.dumps(body)}

    except Exception as exc:
        logger.exception("Sync failed: %s", exc)
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}
