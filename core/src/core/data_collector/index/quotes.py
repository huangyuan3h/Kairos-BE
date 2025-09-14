"""
Index quotes collector (business layer).

This module fetches daily OHLCV for P0 main indexes and ETFs using
Akshare (CN) and yfinance (US). It normalizes to a unified schema for
downstream storage and analytics.

Schema (per row):
  - symbol: unified symbol used in main table (e.g., US:SPX, CN:CSI300, US:SPY)
  - date: ISO date (YYYY-MM-DD)
  - open, high, low, close: float
  - adj_close: float | None
  - volume: int | None
  - currency: str | None
  - source: 'akshare' | 'yfinance'

Design notes
-----------
- CN indexes via Akshare using codes like sh000300/sh000001/sh000905.
- US broad indexes via yfinance using ^GSPC/^NDX/^RUT.
- US ETFs via yfinance using SPY/QQQ/IWM.
- VIX (GLOBAL:VIX) via yfinance ^VIX.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd  # type: ignore[import]


def get_index_source_mapping() -> Dict[str, Tuple[str, str]]:
    """Return mapping from unified symbol -> (source, source_symbol).

    Sources: 'akshare' or 'yfinance'.
    """
    return {
        # US broad indexes
        "US:SPX": ("yfinance", "^GSPC"),
        "US:NDX": ("yfinance", "^NDX"),
        "US:RUT": ("yfinance", "^RUT"),
        # CN major indexes
        "CN:CSI300": ("akshare", "sh000300"),
        "CN:SHCOMP": ("akshare", "sh000001"),
        "CN:CSI500": ("akshare", "sh000905"),
        # US ETFs
        "US:SPY": ("yfinance", "SPY"),
        "US:QQQ": ("yfinance", "QQQ"),
        "US:IWM": ("yfinance", "IWM"),
        # Volatility
        "GLOBAL:VIX": ("yfinance", "^VIX"),
    }


def _fetch_cn_index_akshare(source_symbol: str, start: date, end: date) -> pd.DataFrame:
    # pyright: reportMissingImports=false
    import akshare as ak  # type: ignore[import]

    df = ak.stock_zh_index_daily(symbol=source_symbol)
    # Expected columns: date, open, high, low, close, volume (volume may not exist for some)
    # Normalize types and filter by date range
    df = df.copy()
    # Ensure 'date' is datetime
    if not pd.api.types.is_datetime64_any_dtype(df["date"]):
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).copy()
    df["date"] = df["date"].dt.date
    df = df[(df["date"] >= start) & (df["date"] <= end)].copy()

    # Some series may not include volume; fill with None
    for col in ["open", "high", "low", "close"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        else:
            df[col] = pd.NA
    if "volume" not in df.columns:
        df["volume"] = pd.NA

    # Akshare is usually CNY for CN indexes
    df["currency"] = "CNY"
    df["adj_close"] = pd.NA
    return df[["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]]


def _fetch_yf_symbol(ticker: str, start: date, end: date) -> pd.DataFrame:
    import yfinance as yf  # type: ignore[import]

    hist = yf.Ticker(ticker).history(start=start, end=end, interval="1d", auto_adjust=False)
    if hist is None or hist.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close", "volume", "currency"])

    hist = hist.reset_index().rename(columns={
        "Date": "date",
        "Open": "open",
        "High": "high",
        "Low": "low",
        "Close": "close",
        "Adj Close": "adj_close",
        "Volume": "volume",
    })
    # Convert tz-aware datetime to date
    if not pd.api.types.is_datetime64_any_dtype(hist["date"]):
        hist["date"] = pd.to_datetime(hist["date"], errors="coerce")
    hist = hist.dropna(subset=["date"]).copy()
    hist["date"] = hist["date"].dt.date
    # Currency not always available; leave None
    hist["currency"] = pd.NA
    return hist[["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]]


def fetch_index_quotes(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch daily quotes for a single unified symbol between [start, end].

    Returns a normalized DataFrame with required columns.
    """
    mapping = get_index_source_mapping()
    if symbol not in mapping:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close", "volume", "currency"])

    source, source_symbol = mapping[symbol]
    if source == "akshare":
        return _fetch_cn_index_akshare(source_symbol, start, end)
    if source == "yfinance":
        return _fetch_yf_symbol(source_symbol, start, end)
    return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close", "volume", "currency"])


def build_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch and annotate quotes with symbol and source.

    Output columns: symbol, date, open, high, low, close, adj_close, volume, currency, source
    """
    mapping = get_index_source_mapping()
    src = mapping.get(symbol, (None, None))[0]
    data = fetch_index_quotes(symbol, start, end)
    if data.empty:
        return data
    data = data.copy()
    data.insert(0, "symbol", symbol)
    data["source"] = src
    return data


__all__ = [
    "get_index_source_mapping",
    "fetch_index_quotes",
    "build_quotes_df",
]


