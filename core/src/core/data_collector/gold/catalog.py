"""
Gold asset catalog (minimal schema for the main table).

This module provides a curated catalog of gold-related assets that the
system supports. It focuses on identity and classification only.
"""

# pyright: reportMissingTypeStubs=false, reportMissingImports=false

import logging
from typing import Iterable, Mapping

import pandas as pd

logger = logging.getLogger(__name__)


def _rows_to_dataframe(rows: Iterable[Mapping[str, str]]) -> pd.DataFrame:
    df = pd.DataFrame(list(rows))
    required = {"symbol", "name", "exchange", "asset_type", "market", "status"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    # Order columns in a deterministic way matching our schema preference
    ordered = ["symbol", "name", "exchange", "asset_type", "market", "status"]
    return df[ordered]


def get_gold_catalog() -> pd.DataFrame:
    """Return gold-related assets in the unified catalog schema.

    Notes:
      - Use GLOBAL for spot instruments that do not belong to a single
        exchange (e.g., OTC spot reference like XAU).
      - Futures contracts are represented by their primary exchange.
    """
    sample = [
        {
            "symbol": "GLOBAL:XAU",
            "name": "Gold (Spot)",
            "exchange": "GLOBAL",
            "asset_type": "commodity",
            "market": "COMMODITY",
            "status": "active",
        },
        {
            "symbol": "COMEX:GC",
            "name": "Gold Futures (COMEX)",
            "exchange": "COMEX",
            "asset_type": "commodity",
            "market": "COMMODITY",
            "status": "active",
        },
    ]
    logger.info("Prepared gold catalog entries: %d", len(sample))
    return _rows_to_dataframe(sample)


__all__ = ["get_gold_catalog"]

