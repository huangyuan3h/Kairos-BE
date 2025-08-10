"""
FX asset catalog (minimal schema for the main table).

This module provides an explicit catalog of mainstream FX pairs.
For pricing, use a separate data pipeline; here we only declare support.
"""

# pyright: reportMissingTypeStubs=false, reportMissingImports=false

import logging
from typing import Iterable, Mapping, List, Tuple

import pandas as pd

logger = logging.getLogger(__name__)


def _rows_to_dataframe(rows: Iterable[Mapping[str, str]]) -> pd.DataFrame:
    df = pd.DataFrame(list(rows))
    required = {"symbol", "name", "exchange", "asset_type", "market", "status"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    ordered = ["symbol", "name", "exchange", "asset_type", "market", "status"]
    return df[ordered]


def _build_pair(base: str, quote: str) -> Mapping[str, str]:
    symbol = f"FX:{base}{quote}"
    return {
        "symbol": symbol,
        "name": f"{base}/{quote}",
        "exchange": "INTERBANK",
        "asset_type": "fx",
        "market": "FX",
        "status": "active",
    }


def get_fx_catalog() -> pd.DataFrame:
    """Return mainstream FX pairs in unified catalog schema.

    Conventions:
      - symbol: "FX:<BASE><QUOTE>" (e.g., FX:USDCNY)
      - exchange: "INTERBANK"
      - market: "FX"
    """
    # G10 majors and commonly tracked Asia pairs (including CNH/CNY)
    major_pairs: List[Tuple[str, str]] = [
        ("EUR", "USD"),
        ("USD", "JPY"),
        ("GBP", "USD"),
        ("AUD", "USD"),
        ("NZD", "USD"),
        ("USD", "CAD"),
        ("USD", "CHF"),
        # Crosses
        ("EUR", "JPY"),
        ("EUR", "GBP"),
        ("EUR", "CHF"),
        ("GBP", "JPY"),
        ("AUD", "JPY"),
        ("NZD", "JPY"),
        ("CHF", "JPY"),
        ("CAD", "JPY"),
        # Asia and EM frequently tracked
        ("USD", "CNH"),
        ("USD", "CNY"),
        ("USD", "HKD"),
        ("USD", "SGD"),
        ("USD", "KRW"),
        ("USD", "TWD"),
        ("USD", "INR"),
        ("USD", "IDR"),
        ("USD", "THB"),
        ("USD", "MYR"),
        ("USD", "PHP"),
        ("USD", "VND"),
    ]

    rows = [_build_pair(base, quote) for base, quote in major_pairs]
    logger.info("Prepared FX catalog entries: %d", len(rows))
    return _rows_to_dataframe(rows)


__all__ = ["get_fx_catalog"]

