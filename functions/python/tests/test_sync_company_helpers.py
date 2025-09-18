# Unit tests for helper functions in sync_company.py

from core.data_collector.stock import financials as fz  # type: ignore


def test_shard_ok_determinism():
  sym = "SH600519"
  total = 10
  idx = 3
  # Deterministic: multiple calls should be identical
  first = fz.shard_ok(sym, total, idx)
  second = fz.shard_ok(sym, total, idx)
  assert first == second


def test_build_company_item():
  row = {"symbol": "SH600519", "name": "Kweichow Moutai", "exchange": "SH", "market": "CN_A", "status": "active"}
  item = fz.build_company_item(row, default_score=12.345)
  assert item["pk"] == "SH600519"
  assert item["score"] == 12.345
  assert item["gsi1pk"] == "SCORE"
  assert item["gsi1sk"].startswith("00012.345#SH600519")


