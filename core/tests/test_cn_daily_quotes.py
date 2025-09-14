from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd  # type: ignore[import]
import pytest  # type: ignore[import]

from core.data_collector.stock.daily_quotes import build_cn_stock_quotes_df


def _make_hist_raw() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "日期": ["2025-09-10", "2025-09-11"],
            "开盘": [100.0, 102.0],
            "收盘": [101.0, 103.0],
            "最高": [102.0, 104.0],
            "最低": [99.5, 101.5],
            "成交量": [1000, 2000],  # lots
            "成交额": [1000000.0, 2100000.0],
            "换手率": ["1.00%", "0.80%"],
        }
    )


def _make_hist_qfq() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "日期": ["2025-09-10", "2025-09-11"],
            "收盘": [101.0, 103.0],
        }
    )


def _make_trade_cal() -> pd.DataFrame:
    return pd.DataFrame({"trade_date": ["2025-09-10", "2025-09-11"]})


def test_daily_quotes_normalization(monkeypatch: Any) -> None:
    # Mock akshare endpoints used inside build_cn_stock_quotes_df
    import core.data_collector.stock.daily_quotes as dq

    monkeypatch.setattr(dq, "ak", type("AK", (), {})())
    monkeypatch.setattr(dq.ak, "stock_zh_a_hist", lambda **kwargs: _make_hist_raw() if kwargs.get("adjust", "") == "" else _make_hist_qfq())
    monkeypatch.setattr(dq.ak, "tool_trade_date_hist_df", _make_trade_cal)

    df = build_cn_stock_quotes_df("SH600519", start=date(2025, 9, 10), end=date(2025, 9, 11))
    assert not df.empty

    # Columns present
    expected_cols = {
        "symbol",
        "date",
        "open",
        "high",
        "low",
        "close",
        "adj_close",
        "volume",
        "turnover_amount",
        "turnover_rate",
        "vwap",
        "adj_factor",
    }
    assert expected_cols.issubset(set(df.columns))

    # Units and calculations
    # volume converted lots->shares
    assert int(df.loc[df["date"] == date(2025, 9, 10), "volume"].iloc[0]) == 1000 * 100
    # turnover_rate percent to ratio
    assert df.loc[df["date"] == date(2025, 9, 10), "turnover_rate"].iloc[0] == pytest.approx(0.01, rel=1e-6)
    # vwap = amount/volume
    vwap = 1000000.0 / (1000 * 100)
    assert df.loc[df["date"] == date(2025, 9, 10), "vwap"].iloc[0] == pytest.approx(vwap, rel=1e-6)
    # adj_factor = adj_close/close (here equal as qfq == raw in mock)
    a = df.loc[df["date"] == date(2025, 9, 10), "adj_close"].iloc[0]
    c = df.loc[df["date"] == date(2025, 9, 10), "close"].iloc[0]
    f = df.loc[df["date"] == date(2025, 9, 10), "adj_factor"].iloc[0]
    assert f == pytest.approx(a / c, rel=1e-6)


