from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from core.data_collector.stock.sync import (
    build_cn_sync_plans,
    compute_backfill_start,
)


def test_compute_backfill_start_initial_full_years() -> None:
    today = date(2025, 9, 14)
    s = compute_backfill_start(today=today, latest_iso=None, window_days=5, full_backfill_years=3)
    assert (today - s).days >= 365 * 3 - 2  # allow for leap year handling


def test_compute_backfill_start_initial_window_days() -> None:
    today = date(2025, 9, 14)
    s = compute_backfill_start(today=today, latest_iso=None, window_days=5, full_backfill_years=0)
    assert s == date(2025, 9, 9)


def test_build_cn_sync_plans_skips_up_to_date() -> None:
    today = date(2025, 9, 14)
    last_td = date(2025, 9, 12)
    symbols = ["SH600519", "SZ000001"]

    def _latest(sym: str) -> Optional[str]:
        return "2025-09-12"

    plans = build_cn_sync_plans(
        symbols=symbols,
        get_latest_quote_date=_latest,
        last_trading_day=last_td,
        today=today,
        window_days=5,
        full_backfill_years=3,
    )
    assert plans == []


def test_build_cn_sync_plans_generates_when_behind() -> None:
    today = date(2025, 9, 14)
    last_td = date(2025, 9, 12)
    symbols = ["SH600519", "SZ000001"]

    def _latest(sym: str) -> Optional[str]:
        # behind last_td
        return "2025-09-10"

    plans = build_cn_sync_plans(
        symbols=symbols,
        get_latest_quote_date=_latest,
        last_trading_day=last_td,
        today=today,
        window_days=5,
        full_backfill_years=0,
    )
    # Expect both symbols present, start = max(2025-09-11, 2025-09-09) = 2025-09-11
    assert len(plans) == 2
    assert all(p["start"] == date(2025, 9, 11) for p in plans)


