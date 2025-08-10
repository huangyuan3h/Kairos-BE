"""
US stock asset catalog collector (minimal schema for the main table).

Data source: NASDAQ Trader official symbol directories
  - nasdaqlisted.txt (NASDAQ)
  - otherlisted.txt (NYSE/AMEX/ARCA/BATS)

This implementation avoids paid APIs while producing a production-grade
universe list suitable for the main table. For premium data quality,
consider IEX Cloud or Polygon later without changing output schema.
"""

# pyright: reportMissingTypeStubs=false, reportMissingImports=false

import io
import logging
from typing import Optional

import pandas as pd
import requests

logger = logging.getLogger(__name__)

NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

_OTHER_EXCHANGE_MAP = {
    "A": "AMEX",
    "N": "NYSE",
    "P": "ARCA",
    "Z": "BATS",  # historical; some feeds use Z for BATS
}


def _read_pipe_delimited(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), sep="|")
    # Drop footer row like "File Creation Time" which appears in first column
    first_col = df.columns[0]
    df = df[df[first_col] != "File Creation Time"].copy()
    return df


def _fetch_nasdaq() -> pd.DataFrame:
    resp = requests.get(NASDAQ_LISTED_URL, timeout=30)
    resp.raise_for_status()
    df = _read_pipe_delimited(resp.text)
    # Filter out test issues
    if "Test Issue" in df.columns:
        df = df[df["Test Issue"].astype(str).str.upper() == "N"].copy()
    df["exchange"] = "NASDAQ"
    df = df.rename(columns={"Symbol": "ticker", "Security Name": "name"})
    return df[["ticker", "name", "exchange"]]


def _fetch_other() -> pd.DataFrame:
    resp = requests.get(OTHER_LISTED_URL, timeout=30)
    resp.raise_for_status()
    df = _read_pipe_delimited(resp.text)
    if "Test Issue" in df.columns:
        df = df[df["Test Issue"].astype(str).str.upper() == "N"].copy()
    # Map single-letter code to full exchange name
    df["exchange"] = df["Exchange"].astype(str).map(lambda x: _OTHER_EXCHANGE_MAP.get(x, x))
    # Columns in otherlisted.txt: ACT Symbol | Security Name | Exchange | ...
    df = df.rename(columns={"ACT Symbol": "ticker", "Security Name": "name"})
    return df[["ticker", "name", "exchange"]]


def get_us_stock_catalog(source: Optional[str] = None) -> pd.DataFrame:
    """Return US listings in minimal catalog schema.

    Columns:
      - symbol: "<EXCHANGE>:<TICKER>" (e.g., NASDAQ:AAPL)
      - name: security name
      - exchange: NASDAQ | NYSE | AMEX | ARCA | BATS
      - asset_type: "stock"
      - market: "US"
      - status: "active"
    """
    try:
        logger.info("Fetching US stock universe from NASDAQ Trader directories...")
        nasdaq = _fetch_nasdaq()
        other = _fetch_other()
        base = pd.concat([nasdaq, other], ignore_index=True)
        base = base.dropna(subset=["ticker", "name", "exchange"])  # basic hygiene
        base = base.drop_duplicates(subset=["ticker", "exchange"])  # avoid dups

        base["symbol"] = base.apply(lambda r: f"{r['exchange']}:{str(r['ticker']).strip()}".upper(), axis=1)
        base["asset_type"] = "stock"
        base["market"] = "US"
        base["status"] = "active"

        result = base[[
            "symbol",
            "name",
            "exchange",
            "asset_type",
            "market",
            "status",
        ]].reset_index(drop=True)

        logger.info(f"US stock catalog prepared: {len(result)} symbols")
        return result
    except Exception as e:
        logger.error(f"Failed to build US stock catalog: {str(e)}")
        raise


__all__ = ["get_us_stock_catalog"]

