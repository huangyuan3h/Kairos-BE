from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List

import pandas as pd  # type: ignore[import]

from core.database.IndexData import IndexData
from core.database.MarketData import MarketData


class _RepoStub:
    def __init__(self) -> None:
        self.items: List[Dict[str, Any]] = []

    def batch_put(self, items: List[Dict[str, Any]]) -> None:
        self.items.extend(items)


def _make_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "symbol": "US:SPY",
                "date": date(2025, 1, 2),
                "open": 475.12,
                "high": 480.0,
                "low": 470.5,
                "close": 478.34,
                "adj_close": None,
                "volume": 100,
                "currency": "USD",
                "source": "yfinance",
            },
            {
                "symbol": "CN:CSI300",
                "date": date(2025, 1, 3),
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 100.5,
                "adj_close": float("nan"),
                "volume": None,
                "currency": "CNY",
                "source": "akshare",
            },
        ]
    )


def test_indexdata_upsert_converts_floats_to_decimal(monkeypatch) -> None:
    svc = IndexData(table_name="Dummy", region=None)
    repo = _RepoStub()
    # Inject stub to avoid AWS calls
    svc._repo = repo  # type: ignore[attr-defined,assignment]

    df = _make_df()
    count = svc.upsert_quotes_df(df)
    assert count == 2
    assert len(repo.items) == 2

    first = repo.items[0]
    # Ensure float fields stored as Decimal
    for key in ["open", "high", "low", "close"]:
        assert isinstance(first[key], Decimal)
    # Optional None fields should be omitted (no None values)
    assert "adj_close" not in first or first["adj_close"] is not None


def test_marketdata_upsert_quotes_decimal(monkeypatch) -> None:
    svc = MarketData(table_name="Dummy", region=None)
    repo = _RepoStub()
    svc._repo = repo  # type: ignore[attr-defined,assignment]

    df = _make_df()
    count = svc.upsert_quotes_df(df)
    assert count == 2
    assert len(repo.items) == 2
    first = repo.items[0]
    for key in ["open", "high", "low", "close"]:
        assert isinstance(first[key], Decimal)

