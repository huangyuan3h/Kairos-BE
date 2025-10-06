from __future__ import annotations

import importlib.util
from datetime import date
from pathlib import Path

import pandas as pd  # type: ignore[import]


def _load_quotes_module():
    test_dir = Path(__file__).resolve().parent
    repo_root = (test_dir / ".." / "..").resolve()
    target = repo_root / "core" / "src" / "core" / "data_collector" / "index" / "quotes.py"
    spec = importlib.util.spec_from_file_location("index_quotes", str(target))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[attr-defined]
    return module


def _sample_frame(module, value: float) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "date": [date(2025, 10, 6)],
            "open": [value],
            "high": [value],
            "low": [value],
            "close": [value],
            "adj_close": [value],
            "volume": [1000],
            "currency": ["USD"],
        }
    )[["date", "open", "high", "low", "close", "adj_close", "volume", "currency"]]


def test_fetch_index_quotes_fallback_to_akshare_us(monkeypatch):
    mod = _load_quotes_module()

    monkeypatch.setenv("INDEX_QUOTE_SOURCES", "yfinance,akshare_us")
    monkeypatch.setattr(mod, "FETCH_DISPATCH", dict(mod.FETCH_DISPATCH))

    empty_df = pd.DataFrame(columns=mod._EMPTY_YF_COLUMNS)
    mod.FETCH_DISPATCH["yfinance"] = lambda *_: empty_df
    expected = _sample_frame(mod, 1.23)
    mod.FETCH_DISPATCH["akshare_us"] = lambda *args: expected

    result = mod.fetch_index_quotes("US:SPY", date(2025, 10, 1), date(2025, 10, 6))
    pd.testing.assert_frame_equal(result.reset_index(drop=True), expected.reset_index(drop=True))

    monkeypatch.delenv("INDEX_QUOTE_SOURCES", raising=False)


def test_fetch_index_quotes_prefers_configured_source(monkeypatch):
    mod = _load_quotes_module()

    monkeypatch.setenv("INDEX_QUOTE_SOURCES", "akshare,yfinance")
    monkeypatch.setattr(mod, "FETCH_DISPATCH", dict(mod.FETCH_DISPATCH))

    expected = _sample_frame(mod, 2.34)
    mod.FETCH_DISPATCH["akshare"] = lambda *args: expected
    mod.FETCH_DISPATCH["yfinance"] = lambda *_: pd.DataFrame(columns=mod._EMPTY_YF_COLUMNS)

    result = mod.fetch_index_quotes("CN:CSI300", date(2025, 10, 1), date(2025, 10, 6))
    pd.testing.assert_frame_equal(result.reset_index(drop=True), expected.reset_index(drop=True))

    monkeypatch.delenv("INDEX_QUOTE_SOURCES", raising=False)


def test_fetch_index_quotes_returns_empty_for_unknown_symbol(monkeypatch):
    mod = _load_quotes_module()
    monkeypatch.setattr(mod, "FETCH_DISPATCH", dict(mod.FETCH_DISPATCH))
    result = mod.fetch_index_quotes("UNKNOWN", date(2025, 10, 1), date(2025, 10, 6))
    assert result.empty

