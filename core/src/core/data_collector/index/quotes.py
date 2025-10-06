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
import os
import random
import time
from datetime import date, datetime, timedelta
from json import JSONDecodeError
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import pandas as pd  # type: ignore[import]
from requests.exceptions import RequestException


logger = logging.getLogger("core.data_collector.index.quotes")

_EMPTY_YF_COLUMNS = ["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]


def _get_yfinance_session() -> Optional[object]:
    """Return a cached requests session with browser headers if needed."""
    # yfinance >=0.2.52 prefers curl_cffi-based sessions; returning None lets
    # yfinance manage its internal client. We keep the helper in case future
    # fallbacks require explicit requests sessions.
    return None


def _empty_yf_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=_EMPTY_YF_COLUMNS)


def get_index_source_mapping() -> Dict[str, Dict[str, str]]:
    """Return mapping from unified symbol -> {source_key: source_symbol}."""

    return {
        # US broad indexes
        "US:SPX": {"yfinance": "^GSPC", "akshare_us": "spx"},
        "US:NDX": {"yfinance": "^NDX", "akshare_us": "ndx"},
        "US:RUT": {"yfinance": "^RUT", "akshare_us": "rut"},
        # CN major indexes
        "CN:CSI300": {"akshare": "sh000300"},
        "CN:SHCOMP": {"akshare": "sh000001"},
        "CN:CSI500": {"akshare": "sh000905"},
        # US ETFs
        "US:SPY": {"yfinance": "SPY", "akshare_us": "SPY"},
        "US:QQQ": {"yfinance": "QQQ", "akshare_us": "QQQ"},
        "US:IWM": {"yfinance": "IWM", "akshare_us": "IWM"},
        # Macro indicators & commodities
        "GLOBAL:DXY": {"yfinance": "DX=F"},
        "GLOBAL:WTI": {"yfinance": "CL=F"},
        "GLOBAL:GOLD": {"yfinance": "GC=F"},
        "GLOBAL:MOVE": {"yfinance": "MOVE"},
        # Volatility
        "GLOBAL:VIX": {"yfinance": "^VIX"},
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
    attempts = 3
    last_error: Optional[Exception] = None

    for attempt in range(1, attempts + 1):
        try:
            session = _get_yfinance_session()
            ticker_obj = yf.Ticker(ticker, session=session) if session else yf.Ticker(ticker)
            hist = ticker_obj.history(
                start=start,
                end=end + timedelta(days=1),
                interval="1d",
                auto_adjust=False,
            )

            if hist is None or hist.empty:
                # Fallback to yf.download which uses a different endpoint
                download_kwargs = {
                    "tickers": ticker,
                    "start": start.isoformat(),
                    "end": (end + timedelta(days=1)).isoformat(),
                    "interval": "1d",
                    "auto_adjust": False,
                    "progress": False,
                }
                if session:
                    download_kwargs["session"] = session
                hist = yf.download(**download_kwargs)

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

def _resolve_source_order(spec: Dict[str, str]) -> List[str]:
    env_value = os.getenv("INDEX_QUOTE_SOURCES")
    if env_value:
        configured = [part.strip() for part in env_value.split(",") if part.strip()]
    else:
        configured = []
    # Default order ensures yfinance first, then akshare variants,最后 cn akshare
    default_order = ["yfinance", "akshare_us", "akshare_macro", "akshare"]
    order: List[str] = []
    seen = set()
    for key in configured + default_order:
        if key in spec and key not in seen:
            order.append(key)
            seen.add(key)
    return order


def _fetch_us_equity_akshare(symbol: str, start: date, end: date) -> pd.DataFrame:
    # pyright: reportMissingImports=false
    import akshare as ak  # type: ignore[import]

    start_s = start.strftime("%Y%m%d")
    end_s = end.strftime("%Y%m%d")

    df = ak.stock_us_hist(symbol=symbol, start_date=start_s, end_date=end_s, adjust="")
    if df is None or df.empty:
        df = ak.stock_us_daily(symbol=symbol, adjust="")
    if df is None or df.empty:
        return _empty_yf_frame()

    df = df.copy()
    rename_map = {
        "日期": "date",
        "开盘": "open",
        "最高": "high",
        "最低": "low",
        "收盘": "close",
        "成交量": "volume",
    }
    df = df.rename(columns=rename_map)
    if "date" not in df.columns:
        return _empty_yf_frame()

    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df.dropna(subset=["date"]).copy()
    df = df[(df["date"] >= start) & (df["date"] <= end)].copy()

    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["adj_close"] = pd.NA
    df["currency"] = "USD"
    for col in _EMPTY_YF_COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA
    df = df[_EMPTY_YF_COLUMNS]
    return df


FETCH_DISPATCH: Dict[str, Callable[[str, date, date], pd.DataFrame]] = {
    "yfinance": _fetch_yf_symbol,
    "akshare": _fetch_cn_index_akshare,
    "akshare_us": _fetch_us_equity_akshare,
    # "akshare_macro": _fetch_macro_indicator_akshare,
}


def _fetch_index_quotes_with_source(
    symbol: str, start: date, end: date
) -> Tuple[pd.DataFrame, Optional[str]]:
    mapping = get_index_source_mapping()
    spec = mapping.get(symbol)
    if not spec:
        return _empty_yf_frame(), None

    order = _resolve_source_order(spec)
    for source_key in order:
        token = spec.get(source_key)
        fetcher = FETCH_DISPATCH.get(source_key)
        if not token or fetcher is None:
            continue
        try:
            data = fetcher(token, start, end)
        except Exception as exc:  # 捕获第三方库异常，记录后继续
            logger.warning(
                "index fetcher %s failed for %s: %s",
                source_key,
                symbol,
                str(exc),
            )
            continue
        if data is not None and not data.empty:
            return data, source_key

    return _empty_yf_frame(), None


def fetch_index_quotes(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch daily quotes for a single unified symbol between [start, end].

    Returns a normalized DataFrame with required columns.
    """
    data, _ = _fetch_index_quotes_with_source(symbol, start, end)
    return data


def build_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch and annotate quotes with symbol and source.

    Output columns: symbol, date, open, high, low, close, adj_close, volume, currency, source
    """
    data, source_key = _fetch_index_quotes_with_source(symbol, start, end)
    if data.empty:
        return data
    data = data.copy()
    data.insert(0, "symbol", symbol)
    data["source"] = source_key
    return data


__all__ = [
    "get_index_source_mapping",
    "fetch_index_quotes",
    "build_quotes_df",
]


