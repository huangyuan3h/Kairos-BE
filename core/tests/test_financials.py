from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd  # type: ignore

from core.data_collector.stock import financials as fz


def test_pad_score():
    assert fz.pad_score(0.0) == "00000.000"
    assert fz.pad_score(12.345) == "00012.345"


def test_shard_ok_determinism():
    sym = "SH600519"
    total = 10
    idx = 3
    first = fz.shard_ok(sym, total, idx)
    second = fz.shard_ok(sym, total, idx)
    assert first == second


def test_build_company_item():
    row = {"symbol": "SH600519", "name": "Kweichow Moutai", "exchange": "SH", "market": "CN_A", "status": "active"}
    item = fz.build_company_item(row, default_score=9.9)
    assert item["pk"] == "SH600519"
    assert item["gsi1pk"] == "SCORE"
    assert item["gsi1sk"].startswith("00009.900#SH600519")
    assert item["score"] == 9.9


def test_sync_companies_for_shard_basic(monkeypatch):
    # Prepare a small catalog
    data: List[Dict[str, Any]] = [
        {"symbol": "SH600519", "name": "A", "exchange": "SH", "market": "CN_A", "status": "active"},
        {"symbol": "SZ000001", "name": "B", "exchange": "SZ", "market": "CN_A", "status": "active"},
    ]
    df = pd.DataFrame(data)

    captured: List[Dict[str, Any]] = []

    def fake_put(item: Dict[str, Any]) -> None:
        captured.append(item)

    def fake_catalog_df():
        return df

    # Avoid actual sleeps
    monkeypatch.setattr(fz, "rate_limit_pause", lambda i: None)

    out = fz.sync_companies_for_shard(
        company_put=fake_put,
        get_catalog_df=fake_catalog_df,
        shard_total=1,
        shard_index=0,
        max_symbols=0,
    )

    assert out["companies_upserted"] == 2
    assert len(captured) == 2


