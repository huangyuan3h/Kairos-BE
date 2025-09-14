from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any, Dict, List
import json
import importlib.util
from pathlib import Path

import pandas as pd  # type: ignore[import]


def _df_catalog(rows: List[Dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame(rows)[
        ["symbol", "name", "exchange", "asset_type", "market", "status"]
    ]


def _load_module_from_repo(rel_path: str, name: str):
    # tests are under core/tests → go to repo root
    test_dir = Path(__file__).resolve().parent
    repo_root = (test_dir / ".." / "..").resolve()
    target = repo_root / rel_path
    spec = importlib.util.spec_from_file_location(name, str(target))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    return mod


def test_sync_market_data_counts(monkeypatch) -> None:
    mod = _load_module_from_repo("functions/python/sync_market_data.py", "sync_market_data_mod")

    class FakeMarketData:
        def __init__(self, table_name: str, region: str | None) -> None:
            self.calls: List[int] = []

        def upsert_stock_catalog(self, df: pd.DataFrame) -> int:
            n = 0 if df is None or df.empty else len(df)
            self.calls.append(n)
            return n

    def fake_cn():
        return _df_catalog([
            {"symbol": "SH600000", "name": "PABC", "exchange": "SH", "asset_type": "stock", "market": "CN_A", "status": "active"}
        ])

    def fake_us():
        return _df_catalog([
            {"symbol": "NASDAQ:AAPL", "name": "Apple", "exchange": "NASDAQ", "asset_type": "stock", "market": "US", "status": "active"}
        ])

    def fake_idx():
        return _df_catalog([
            {"symbol": "US:SPX", "name": "S&P 500", "exchange": "US", "asset_type": "index", "market": "INDEX", "status": "active"}
        ])

    monkeypatch.setattr(mod, "MarketData", FakeMarketData)
    monkeypatch.setattr(mod, "get_cn_a_stock_catalog", fake_cn)
    monkeypatch.setattr(mod, "get_us_stock_catalog", fake_us)
    monkeypatch.setattr(mod, "get_main_index_catalog", fake_idx)

    os.environ["MARKET_DATA_TABLE"] = "Dummy"
    res = mod.handler({}, None)
    body = json.loads(res["body"]) if isinstance(res["body"], str) else res["body"]
    assert res["statusCode"] == 200
    assert body["cn"] == 1 and body["us"] == 1 and body["index"] == 1 and body["total"] == 3


def test_sync_index_quotes_backfill_runs_on_closed_day(monkeypatch) -> None:
    mod = _load_module_from_repo("functions/python/sync_index_quotes.py", "sync_index_quotes_mod_1")

    class FakeIndexData:
        def __init__(self, table_name: str, region: str | None) -> None:
            self.count = 0

        def get_latest_quote_date(self, symbol: str) -> str | None:
            # Yesterday minus 2 days → start < today (needs backfill)
            return (date.today() - timedelta(days=2)).isoformat()

        def upsert_quotes_df(self, df: pd.DataFrame) -> int:
            n = 0 if df.empty else len(df)
            self.count += n
            return n

    class FakeMarketData:
        def __init__(self, table_name: str, region: str | None) -> None:
            pass

        def query_stock_catalog_df(self, asset_type: str, market: str, status: str, columns=None, limit=None):
            return pd.DataFrame({"symbol": ["US:SPY"]})

    def fake_is_trading_day(market: str, d: date) -> bool:
        return False  # closed day

    def fake_build_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
        # Return 2 rows for backfill range
        days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        return pd.DataFrame({
            "symbol": [symbol] * len(days),
            "date": days,
            "open": [1.0] * len(days),
            "high": [1.0] * len(days),
            "low": [1.0] * len(days),
            "close": [1.0] * len(days),
        })

    def fake_mapping():
        return {"US:SPY": ("yfinance", "SPY")}

    monkeypatch.setattr(mod, "IndexData", FakeIndexData)
    monkeypatch.setattr(mod, "MarketData", FakeMarketData)
    monkeypatch.setattr(mod, "is_trading_day", fake_is_trading_day)
    monkeypatch.setattr(mod, "build_quotes_df", fake_build_quotes_df)
    monkeypatch.setattr(mod, "get_index_source_mapping", fake_mapping)

    os.environ["INDEX_DATA_TABLE"] = "Dummy"
    os.environ["MARKET_DATA_TABLE"] = "Dummy"
    res = mod.handler({}, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"]) if isinstance(res["body"], str) else res["body"]
    assert body["total_rows"] > 0  # backfill executed even on closed day


def test_sync_index_quotes_today_only_gated(monkeypatch) -> None:
    mod = _load_module_from_repo("functions/python/sync_index_quotes.py", "sync_index_quotes_mod_2")

    class FakeIndexData:
        def __init__(self, table_name: str, region: str | None) -> None:
            pass

        def get_latest_quote_date(self, symbol: str) -> str | None:
            # Latest is yesterday → start == today
            return (date.today() - timedelta(days=1)).isoformat()

        def upsert_quotes_df(self, df: pd.DataFrame) -> int:
            return len(df)

    class FakeMarketData:
        def __init__(self, table_name: str, region: str | None) -> None:
            pass

        def query_stock_catalog_df(self, asset_type: str, market: str, status: str, columns=None, limit=None):
            return pd.DataFrame({"symbol": ["US:SPY"]})

    def fake_is_trading_day(market: str, d: date) -> bool:
        return False  # closed day triggers gating for today-only fetch

    def fake_build_quotes_df(symbol: str, start: date, end: date) -> pd.DataFrame:
        # Would have returned 1 row if executed
        return pd.DataFrame({"symbol": [], "date": []})

    def fake_mapping():
        return {"US:SPY": ("yfinance", "SPY")}

    monkeypatch.setattr(mod, "IndexData", FakeIndexData)
    monkeypatch.setattr(mod, "MarketData", FakeMarketData)
    monkeypatch.setattr(mod, "is_trading_day", fake_is_trading_day)
    monkeypatch.setattr(mod, "build_quotes_df", fake_build_quotes_df)
    monkeypatch.setattr(mod, "get_index_source_mapping", fake_mapping)

    os.environ["INDEX_DATA_TABLE"] = "Dummy"
    os.environ["MARKET_DATA_TABLE"] = "Dummy"
    res = mod.handler({}, None)
    assert res["statusCode"] == 200
    body = json.loads(res["body"]) if isinstance(res["body"], str) else res["body"]
    # Expect skipped due to sentinel/non-trading for today-only fetch
    assert any(r.get("skipped") for r in body.get("results", []))

