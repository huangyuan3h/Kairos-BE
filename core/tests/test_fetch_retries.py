from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd  # type: ignore[import]

from core.data_collector.stock.daily_quotes import build_cn_stock_quotes_df


def _df_ok() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "日期": ["2025-09-10"],
            "开盘": [10.0],
            "收盘": [10.5],
            "最高": [11.0],
            "最低": [9.9],
            "成交量": [1000],
            "成交额": [100000.0],
            "换手率": ["1.00%"],
        }
    )


def test_hist_retry_succeeds_after_failure(monkeypatch: Any) -> None:
    import core.data_collector.stock.daily_quotes as dq

    calls = {"n": 0}

    def _hist(**kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("transient")
        # return qfq data if requested
        if kwargs.get("adjust", "") == "qfq":
            df = _df_ok()[["日期", "收盘"]].copy()
            return df
        return _df_ok()

    monkeypatch.setattr(dq, "ak", type("AK", (), {})())
    monkeypatch.setattr(dq.ak, "stock_zh_a_hist", _hist, raising=False)

    df = build_cn_stock_quotes_df("SH600519", start=date(2025, 9, 10), end=date(2025, 9, 10))
    assert not df.empty
    assert set(["symbol", "date", "open", "close", "turnover_rate"]).issubset(set(df.columns))


