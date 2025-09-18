"""
Lambda: Quarterly company sync for CN companies (sharded, rate-limited).

High-level behavior
-------------------
- Load CN A-share active symbols from MarketData catalog.
- Apply deterministic sharding (via md5) per Lambda shard.
- For each symbol in this shard, upsert ONE row per company in the Company table.
  The row contains basic identity fields and a score used for coarse filtering.
- Sequential processing with random jitters to mitigate upstream anti-bot.

Environment
-----------
- COMPANY_TABLE (required): DynamoDB table for companies
- MARKET_DATA_TABLE (required): DynamoDB table for catalog
- SHARD_TOTAL (optional, default 1): number of shards
- SHARD_INDEX (optional, default 0): shard index of this Lambda
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List


from core.database import MarketData, Company
from core.data_collector.stock.financials import sync_companies_for_shard


logger = logging.getLogger()
logger.setLevel(logging.INFO)
 


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    try:
        company_table = os.getenv("COMPANY_TABLE", "Company")
        market_table = os.getenv("MARKET_DATA_TABLE", "MarketData")
        region = os.getenv("AWS_REGION")
        shard_total = int(os.getenv("SHARD_TOTAL", "1"))
        shard_index = int(os.getenv("SHARD_INDEX", "0"))
        max_symbols = int(os.getenv("MAX_SYMBOLS", "200"))

        catalog = MarketData(table_name=market_table, region=region)
        company_repo = Company(table_name=company_table, region=region)

        def _get_catalog_df():
            return catalog.query_stock_catalog_df(
                asset_type="stock",
                market="CN_A",
                status="active",
                columns=["symbol", "name", "exchange", "market", "status"],
            )

        outcome = sync_companies_for_shard(
            company_put=company_repo.put_company,
            get_catalog_df=_get_catalog_df,
            shard_total=shard_total,
            shard_index=shard_index,
            max_symbols=max_symbols,
            include_financials=True,
        )
        return {"statusCode": 200, "body": json.dumps(outcome)}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Company sync failed: %s", exc)
        return {"statusCode": 500, "body": json.dumps({"error": str(exc)})}


