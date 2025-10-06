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

import logging
import random
import time
from datetime import date, datetime, timedelta
from json import JSONDecodeError
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd  # type: ignore[import]
import requests
from requests import Session
from requests.exceptions import RequestException


logger = logging.getLogger("core.data_collector.index.quotes")

_YF_SESSION: Optional[Session] = None

_EMPTY_YF_COLUMNS = ["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]


def _get_yfinance_session() -> Session:
    """Return a cached requests session with headers accepted by Yahoo endpoints."""
    global _YF_SESSION
    if _YF_SESSION is None:
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive",
            }
        )
        _YF_SESSION = session
    return _YF_SESSION


def _empty_yf_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=_EMPTY_YF_COLUMNS)


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
        # Macro indicators & commodities
        "GLOBAL:DXY": ("yfinance", "DX=F"),  # US Dollar Index futures (ICE)
        "GLOBAL:WTI": ("yfinance", "CL=F"),  # WTI crude oil front-month futures
        "GLOBAL:GOLD": ("yfinance", "GC=F"),  # COMEX gold futures
        "GLOBAL:MOVE": ("yfinance", "MOVE"),  # ICE BofA MOVE Index
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
    session = _get_yfinance_session()
    attempts = 3
    last_error: Optional[Exception] = None

    for attempt in range(1, attempts + 1):
        try:
            ticker_obj = yf.Ticker(ticker, session=session)
            hist = ticker_obj.history(
                start=start,
                end=end + timedelta(days=1),
                interval="1d",
                auto_adjust=False,
            )

            if hist is None or hist.empty:
                # Fallback to yf.download which uses a different endpoint
                hist = yf.download(
                    tickers=ticker,
                    start=start.isoformat(),
                    end=(end + timedelta(days=1)).isoformat(),
                    interval="1d",
                    auto_adjust=False,
                    session=session,
                    progress=False,
                )

            if hist is None or hist.empty:
                logger.warning(
                    "yfinance returned empty frame: %s",
                    {
                        "ticker": ticker,
                        "start": start.isoformat(),
                        "end": end.isoformat(),
                        "attempt": attempt,
                    },
                )
                return _empty_yf_frame()

            hist = hist.reset_index()
            rename_map = {
                "Date": "date",
                "Datetime": "date",
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Adj Close": "adj_close",
                "AdjClose": "adj_close",
                "Volume": "volume",
            }
            hist = hist.rename(columns=rename_map)

            if "date" not in hist.columns:
                logger.error(
                    "yfinance output missing date column: %s",
                    {"ticker": ticker},
                )
                return _empty_yf_frame()

            if not pd.api.types.is_datetime64_any_dtype(hist["date"]):
                hist["date"] = pd.to_datetime(hist["date"], errors="coerce")
            hist = hist.dropna(subset=["date"]).copy()
            hist["date"] = hist["date"].dt.date

            for col in ["open", "high", "low", "close", "adj_close", "volume"]:
                if col in hist.columns:
                    hist[col] = pd.to_numeric(hist[col], errors="coerce")

            for col in _EMPTY_YF_COLUMNS:
                if col not in hist.columns:
                    hist[col] = pd.NA

            hist["currency"] = pd.NA
            hist = hist[_EMPTY_YF_COLUMNS]
            return hist
        except (JSONDecodeError, RequestException, ValueError, KeyError) as exc:
            last_error = exc
            logger.warning(
                "yfinance fetch attempt failed: %s",
                {
                    "ticker": ticker,
                    "attempt": attempt,
                    "error": str(exc),
                },
            )
            if attempt < attempts:
                sleep_s = 0.75 * attempt + random.uniform(0, 0.5)
                time.sleep(sleep_s)
                continue

    logger.error(
        "yfinance fetch failed after retries: %s",
        {
            "ticker": ticker,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "error": str(last_error) if last_error else "unknown",
        },
    )
    return _empty_yf_frame()


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


