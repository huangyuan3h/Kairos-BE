#!/usr/bin/env python3
"""
Simple test script to verify development environment configuration.
"""

from core.data_collector.stock.cn_stock_catalog import get_cn_a_stock_catalog
from core.data_collector.stock.us_stock_catalog import get_us_stock_catalog
from core.data_collector.gold.catalog import get_gold_catalog
from core.data_collector.fx.catalog import get_fx_catalog
from core.data_collector.index.catalog import get_index_catalog


def main():
    """Main function to test catalog collectors."""
    print("Testing catalog collectors...")

    # cn_df = get_cn_a_stock_catalog()
    # print("CN A-share catalog (head):")
    # print(cn_df.head())

    # us_df = get_us_stock_catalog()
    # print("US stock catalog (head):")
    # print(us_df.head())

    gold_df = get_gold_catalog()
    print("Gold catalog (head):")
    print(gold_df.head())

    fx_df = get_fx_catalog()
    print("FX catalog (head):")
    print(fx_df.head())

    index_df = get_index_catalog()
    print("Index catalog (head):")
    print(index_df.head())

    print("All tests passed!")


if __name__ == "__main__":
    main()