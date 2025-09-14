"""
Planning utilities for CN A-share daily quotes synchronization.

This module determines whether a symbol needs syncing based on the
latest stored date versus the most recent trading day, and computes the
start date using a backfill window.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Callable, Dict, List, Optional, TypedDict


class SyncPlan(TypedDict):
    symbol: str
    start: date


def _subtract_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        # Handle Feb 29 etc.
        return d - timedelta(days=365 * years)


def compute_backfill_start(
    today: date,
    latest_iso: Optional[str],
    window_days: int,
    full_backfill_years: int = 0,
) -> date:
    if latest_iso is None:
        # Initial load: prefer full backfill years if configured, else window_days
        if full_backfill_years > 0:
            return _subtract_years(today, full_backfill_years)
        return today - timedelta(days=window_days)
    y, m, d = latest_iso.split("-")
    latest_d = date(int(y), int(m), int(d))
    default_start = today - timedelta(days=window_days)
    return max(default_start, latest_d + timedelta(days=1))


def build_cn_sync_plans(
    symbols: List[str],
    get_latest_quote_date: Callable[[str], Optional[str]],
    last_trading_day: date,
    today: date,
    window_days: int,
    full_backfill_years: int = 0,
    initial_only: bool = False,
) -> List[SyncPlan]:
    plans: List[SyncPlan] = []
    for sym in symbols:
        latest = get_latest_quote_date(sym)
        if initial_only and latest is not None:
            # Only schedule symbols with no history at all
            continue
        # If already up-to-date for the most recent trading day, skip
        if latest is not None:
            try:
                y, m, d = str(latest).split("-")
                if date(int(y), int(m), int(d)) >= last_trading_day:
                    continue
            except Exception:
                # If parsing fails, treat as missing and allow backfill
                pass
        start = compute_backfill_start(today, latest, window_days, full_backfill_years)
        if start <= today:
            plans.append({"symbol": sym, "start": start})
    return plans


