"""
CN A-share asset catalog collector.

This module outputs a minimal catalog for the main table, indicating
which A-share equities are supported. It does not include price fields.
"""

# pyright: reportMissingTypeStubs=false, reportMissingImports=false

import logging
from typing import Optional

import akshare as ak
import pandas as pd

logger = logging.getLogger(__name__)


def infer_exchange(code: str) -> str:
    """Infer CN exchange from raw stock code.

    Heuristics:
      - SH: 600/601/603/605/688/689
      - SZ: 000/001/002/003/300/301
      - BJ: 430/830-839/870-879
    """
    normalized = str(code).strip()
    if not normalized or not normalized[0].isdigit():
        return "UNKNOWN"

    if normalized.startswith(("600", "601", "603", "605", "688", "689")):
        return "SH"
    if normalized.startswith(("000", "001", "002", "003", "300", "301")):
        return "SZ"
    if (
        normalized.startswith("430")
        or normalized.startswith(tuple(str(n) for n in range(830, 840)))
        or normalized.startswith(tuple(str(n) for n in range(870, 880)))
    ):
        return "BJ"

    if len(normalized) == 6:
        return "SH"

    return "UNKNOWN"


def to_canonical_symbol(code: str) -> str:
    """Build canonical symbol used as PK for main table, e.g. 600519 -> SH600519."""
    exch = infer_exchange(code)
    return f"{exch}{code}" if exch != "UNKNOWN" else str(code)


def get_cn_a_stock_catalog() -> Optional[pd.DataFrame]:
    """Return CN A-share catalog with minimal schema for the main table.

    Columns:
      - symbol
      - name
      - exchange
      - asset_type (stock)
      - market (CN_A)
      - status (active|deactive)
    """
    try:
        logger.info("Fetching CN A-share universe (catalog)...")
        raw = ak.stock_zh_a_spot_em()

        base = raw[["代码", "名称"]].dropna().drop_duplicates("代码").copy()
        base["exchange"] = base["代码"].astype(str).map(infer_exchange)
        base = base[base["exchange"] != "UNKNOWN"].copy()
        base["symbol"] = base["代码"].astype(str).map(to_canonical_symbol)
        base["name"] = base["名称"].astype(str)
        base["asset_type"] = "stock"
        base["market"] = "CN_A"
        base["status"] = "active"

        result = base[[
            "symbol",
            "name",
            "exchange",
            "asset_type",
            "market",
            "status",
        ]].reset_index(drop=True)

        logger.info(f"CN A-share catalog prepared: {len(result)} symbols")
        return result
    except Exception as e:
        logger.error(f"Failed to build CN A-share catalog: {str(e)}")
        raise


__all__ = [
    "infer_exchange",
    "to_canonical_symbol",
    "get_cn_a_stock_catalog",
]

