"""
Trading calendar utilities using pandas-market-calendars.

Provides market-to-exchange mapping and helpers to check whether a given
date is a trading day for that market.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd  # type: ignore[import]


def _get_calendar_code(market: str) -> Optional[str]:
    m = market.strip().upper()
    if m == "CN":
        return "XSHG"  # Shanghai Stock Exchange
    if m == "US":
        return "XNYS"  # New York Stock Exchange
    return None


def is_trading_day(market: str, d: date) -> bool:
    # pyright: reportMissingImports=false
    import pandas_market_calendars as pmc  # type: ignore[import]

    code = _get_calendar_code(market)
    if code is None:
        # Unknown market -> be permissive to avoid false negatives
        return True
    cal = pmc.get_calendar(code)
    schedule = cal.schedule(start_date=d, end_date=d)
    return not schedule.empty


def last_trading_day(market: str, d: date) -> date:
    """Return the most recent trading day on or before the given date for the market."""
    # pyright: reportMissingImports=false
    import pandas_market_calendars as pmc  # type: ignore[import]

    code = _get_calendar_code(market)
    if code is None:
        return d
    cal = pmc.get_calendar(code)
    # Expand range a bit to ensure previous sessions exist at month edges
    start = pd.Timestamp(d) - pd.Timedelta(days=14)
    end = pd.Timestamp(d)
    schedule = cal.schedule(start_date=start, end_date=end)
    if schedule.empty:
        return d
    # last trading session end
    last = schedule.index[-1]
    return last.date()


def infer_market_from_symbol(symbol: str) -> Optional[str]:
    s = str(symbol).strip().upper()
    if s.startswith("CN:"):
        return "CN"
    if s.startswith("US:"):
        return "US"
    if s == "GLOBAL:VIX":
        return "US"
    return None


__all__ = [
    "is_trading_day",
    "infer_market_from_symbol",
]


