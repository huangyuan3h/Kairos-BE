"""
CN A-share daily OHLCV collector (business layer).

This module fetches daily OHLCV for CN A-shares using Akshare and
normalizes the output to a unified schema for downstream storage.

Output schema (per row):
- symbol: unified symbol (e.g., SH600519)
- date: ISO date (YYYY-MM-DD)
- open, high, low, close: float
- adj_close: float | None
- volume: int | None
- currency: str | None (CNY for CN A-shares)
- source: 'akshare'
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd  # type: ignore[import]


def to_akshare_symbol(cn_symbol: str) -> str:
    """Convert unified symbol like SH600519 to Akshare symbol like sh600519.

    Rules:
    - SH -> sh
    - SZ -> sz
    - BJ -> bj
    Fallback: lower-cased string if prefix is unknown.
    """
    s = str(cn_symbol).strip()
    if not s:
        return s
    prefix = s[:2].upper()
    rest = s[2:]
    if prefix == "SH":
        return f"sh{rest}"
    if prefix == "SZ":
        return f"sz{rest}"
    if prefix == "BJ":
        return f"bj{rest}"
    return s.lower()


def _fetch_cn_stock_daily_ak(symbol_ak: str, start: date, end: date) -> pd.DataFrame:
    # pyright: reportMissingImports=false
    import akshare as ak  # type: ignore[import]

    # Prefer stock_zh_a_daily which accepts sh/sz/bj prefix
    try:
        df = ak.stock_zh_a_daily(symbol=symbol_ak)
        # Expected: columns include 'date', 'open', 'high', 'low', 'close', maybe 'volume'
    except Exception:
        # Fallback to hist API with best-effort normalization
        # Some Akshare versions expose: stock_zh_a_hist(symbol="600519", start_date="YYYYMMDD", end_date="YYYYMMDD")
        code = symbol_ak[-6:]
        start_s = start.strftime("%Y%m%d")
        end_s = end.strftime("%Y%m%d")
        hist = ak.stock_zh_a_hist(symbol=code, start_date=start_s, end_date=end_s, adjust="")
        if hist is None or hist.empty:
            return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close", "volume", "currency"])  # noqa: E501
        # Normalize hist columns if using fallback
        hist = hist.rename(columns={
            "日期": "date",
            "开盘": "open",
            "最高": "high",
            "最低": "low",
            "收盘": "close",
            "成交量": "volume",
        })
        if "date" in hist.columns and not pd.api.types.is_datetime64_any_dtype(hist["date"]):
            hist["date"] = pd.to_datetime(hist["date"], errors="coerce")
        hist = hist.dropna(subset=["date"]).copy()
        hist["date"] = hist["date"].dt.date
        hist = hist[(hist["date"] >= start) & (hist["date"] <= end)].copy()
        hist["adj_close"] = pd.NA
        hist["currency"] = "CNY"
        return hist[["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]]

    if df is None or df.empty:
        return pd.DataFrame(columns=["date", "open", "high", "low", "close", "adj_close", "volume", "currency"])  # noqa: E501

    out = df.copy()
    # Ensure 'date' column exists and is date
    if "date" not in out.columns:
        # Some versions use index as date
        out = out.reset_index().rename(columns={"index": "date", "date": "date"})
    if not pd.api.types.is_datetime64_any_dtype(out["date"]):
        out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out = out.dropna(subset=["date"]).copy()
    out["date"] = out["date"].dt.date
    out = out[(out["date"] >= start) & (out["date"] <= end)].copy()

    for col in ["open", "high", "low", "close"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")
        else:
            out[col] = pd.NA
    if "volume" not in out.columns:
        out["volume"] = pd.NA

    out["adj_close"] = pd.NA
    out["currency"] = "CNY"
    return out[["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]]


def build_cn_stock_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch daily quotes for a CN A-share unified symbol and annotate.

    Returns DataFrame with columns:
    symbol, date, open, high, low, close, adj_close, volume, currency, source
    """
    ak_symbol = to_akshare_symbol(symbol)
    base = _fetch_cn_stock_daily_ak(ak_symbol, start=start, end=end)
    if base.empty:
        return base
    base = base.copy()
    base.insert(0, "symbol", symbol)
    base["source"] = "akshare"
    return base


__all__ = [
    "to_akshare_symbol",
    "build_cn_stock_quotes_df",
]


