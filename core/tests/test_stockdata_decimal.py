from __future__ import annotations

from datetime import date
import os
from decimal import Decimal
from typing import Any, Dict, List

import pandas as pd  # type: ignore[import]

from core.database.StockData import StockData


class _RepoStub:
    def __init__(self) -> None:
        self.items: List[Dict[str, Any]] = []

    def batch_put(self, items: List[Dict[str, Any]]) -> None:
        self.items.extend(items)


def _make_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "symbol": "SH600519",
                "date": date(2025, 1, 2),
                "open": 1700.12,
                "high": 1750.0,
                "low": 1680.5,
                "close": 1722.34,
                "adj_close": None,
                "volume": 1234567,
                "currency": "CNY",
                "source": "akshare",
            },
            {
                "symbol": "SZ000001",
                "date": date(2025, 1, 3),
                "open": 10.0,
                "high": 10.2,
                "low": 9.9,
                "close": 10.1,
                "adj_close": float("nan"),
                "volume": None,
                "currency": "CNY",
                "source": "akshare",
            },
        ]
    )


def test_stockdata_upsert_converts_floats_to_decimal(monkeypatch) -> None:
    os.environ.setdefault("AWS_REGION", "us-east-1")
    svc = StockData(table_name="Dummy", region=None)
    repo = _RepoStub()
    svc._repo = repo  # type: ignore[attr-defined,assignment]

    df = _make_df()
    count = svc.upsert_quotes_df(df)
    assert count == 2
    assert len(repo.items) == 2

    first = repo.items[0]
    for key in ["open", "high", "low", "close"]:
        assert isinstance(first[key], Decimal)


