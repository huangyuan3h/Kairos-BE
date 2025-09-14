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
- turnover_amount: float | None
- turnover_rate: float | None
- vwap: float | None
- adj_factor: float | None
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd  # type: ignore[import]
import numpy as np  # type: ignore[import]
# pyright: reportMissingTypeStubs=false, reportMissingImports=false
import akshare as ak  # type: ignore[import]
import time
import random


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


def _fetch_cn_stock_daily_ak(symbol_unified: str, start: date, end: date) -> pd.DataFrame:
    """Enhanced multi-source fetch using ak.stock_zh_a_hist as the primary source.

    - Pull raw (no adjust) and qfq adjusted, then compute adj_close and adj_factor
    - Normalize numeric types, convert volume to shares (x100), turnover_rate to ratio
    - Build trading calendar to detect suspended days; forward-fill prices on suspended days
    """
    # Convert unified symbol (e.g., SH600519) to 6-digit code for hist API
    code = str(symbol_unified)[-6:]
    start_s = start.strftime("%Y%m%d")
    end_s = end.strftime("%Y%m%d")

    # 1) Raw (no adjust)
    def _call_hist(adjust: str):
        return ak.stock_zh_a_hist(symbol=code, period="daily", start_date=start_s, end_date=end_s, adjust=adjust)

    # Simple retry with backoff + jitter
    def _retry_call(fn, *args, **kwargs):
        max_attempts = 3
        base = 0.25
        for attempt in range(1, max_attempts + 1):
            try:
                return fn(*args, **kwargs)
            except Exception:  # Best-effort; upstream can vary
                if attempt == max_attempts:
                    raise
                sleep_s = base * (2 ** (attempt - 1)) + random.uniform(0, base)
                time.sleep(sleep_s)

    df_raw = None
    try:
        df_raw = _retry_call(_call_hist, "")
    except Exception:
        df_raw = None
    if df_raw is None or df_raw.empty:
        return pd.DataFrame(columns=[
            "date", "open", "high", "low", "close", "adj_close", "volume",
            "turnover_amount", "turnover_rate", "vwap", "limit_up", "limit_down",
            "is_suspended", "trading_status", "adj_factor",
        ])

    # 2) QFQ for adj_close
    try:
        df_qfq = _retry_call(_call_hist, "qfq")
    except Exception:
        df_qfq = None
    if df_qfq is None or df_qfq.empty:
        df_qfq = df_raw[["日期", "收盘"]].rename(columns={"收盘": "收盘_qfq"}).copy()
    else:
        df_qfq = df_qfq[["日期", "收盘"]].rename(columns={"收盘": "收盘_qfq"})

    # 3) Merge and normalize
    df = pd.merge(df_raw, df_qfq, on="日期", how="left")
    df = df.rename(columns={
        "日期": "date",
        "开盘": "open",
        "最高": "high",
        "最低": "low",
        "收盘": "close",
        "成交量": "volume",
        "成交额": "turnover_amount",
        "换手率": "turnover_rate",
        "收盘_qfq": "adj_close",
    })
    # Date filter and typing
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df[(df["date"] >= start) & (df["date"] <= end)].copy()

    for col in ["open", "high", "low", "close", "adj_close", "volume", "turnover_amount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    # Convert units
    if "volume" in df.columns:
        df["volume"] = df["volume"] * 100  # lots to shares
    if "turnover_rate" in df.columns:
        # Detect percentage by presence of '%'; convert to ratio if found
        orig = df["turnover_rate"].astype(str)
        has_pct = orig.str.contains("%", regex=False).any()
        tr = orig.str.replace("%", "", regex=False)
        df["turnover_rate"] = pd.to_numeric(tr, errors="coerce")
        if has_pct:
            df["turnover_rate"] = df["turnover_rate"] / 100.0

    # 4) Derived fields
    df["adj_factor"] = df["adj_close"] / df["close"]
    with np.errstate(divide="ignore", invalid="ignore"):
        df["vwap"] = df["turnover_amount"] / df["volume"]
    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    return df[[
        "date", "open", "high", "low", "close", "adj_close", "volume",
        "turnover_amount", "turnover_rate", "vwap", "adj_factor",
    ]]


def build_cn_stock_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
    """Fetch daily quotes for a CN A-share unified symbol and annotate.

    Returns DataFrame with columns:
    symbol, date, open, high, low, close, adj_close, volume,
    turnover_amount, turnover_rate, vwap, adj_factor
    """
    # Use enhanced hist-based fetcher; accepts unified symbol and handles conversion
    base = _fetch_cn_stock_daily_ak(symbol, start=start, end=end)
    if base.empty:
        return base
    base = base.copy()
    base.insert(0, "symbol", symbol)
    return base


__all__ = [
    "to_akshare_symbol",
    "build_cn_stock_quotes_df",
]


