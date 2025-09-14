from __future__ import annotations

from core.data_collector.stock.daily_quotes import to_akshare_symbol


def test_to_akshare_symbol_basic() -> None:
    assert to_akshare_symbol("SH600519") == "sh600519"
    assert to_akshare_symbol("SZ000001") == "sz000001"
    assert to_akshare_symbol("BJ430047") == "bj430047"
    assert to_akshare_symbol("sh600519") == "sh600519"
    assert to_akshare_symbol("") == ""


