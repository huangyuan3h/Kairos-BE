import pandas as pd
import pytest

from core.data_collector.stock.cn_stock_catalog import (
    get_cn_a_stock_catalog as get_a_share_spot_data,
    infer_exchange,
    to_canonical_symbol,
)


def test_infer_exchange_basic():
    assert infer_exchange("600519") == "SH"
    assert infer_exchange("000001") == "SZ"
    assert infer_exchange("430047") == "BJ"
    # Unknown keep fallback
    assert infer_exchange("XYZ") == "UNKNOWN"


def test_symbol_and_display_name_formatting():
    code = "600519"
    name = "贵州茅台"
    sym = to_canonical_symbol(code)
    assert sym == "SH600519"
    # display_name removed from schema; formatting helper deprecated


def test_get_a_share_spot_data_minimal_schema(monkeypatch):
    sample = pd.DataFrame(
        {
            "代码": ["600519", "000001", "430047", "ABCDEF"],
            "名称": ["贵州茅台", "平安银行", "北京科锐", "无效"],
            # extra columns should be ignored by the function
            "最新价": [1, 2, 3, 4],
        }
    )

    def fake_fetch():
        return sample

    monkeypatch.setattr("akshare.stock_zh_a_spot_em", fake_fetch)

    df = get_a_share_spot_data()
    # Unknown code should be filtered out
    assert set(df.columns) == {
        "symbol",
        "name",
        "exchange",
        "asset_type",
        "market",
        "status",
    }
    # Expect 3 valid rows (exclude ABCDEF)
    assert len(df) == 3

    row = df[df["symbol"] == "SH600519"].iloc[0]
    assert row["name"] == "贵州茅台"
    assert row["exchange"] == "SH"
    assert row["asset_type"] == "stock"
    assert row["market"] == "CN_A"
    assert row["status"] == "active"

