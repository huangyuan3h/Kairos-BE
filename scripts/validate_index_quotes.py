"""Utility script to fetch and validate index quotes using configured data sources."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable, List, Tuple

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "core" / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from core.data_collector.index.quotes import fetch_index_quotes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch index quotes for given symbols and print summary information."
    )
    parser.add_argument(
        "--symbols",
        type=str,
        required=False,
        default="US:SPX,US:NDX,US:RUT,US:SPY,US:QQQ,US:IWM,GLOBAL:VIX,GLOBAL:WTI,GLOBAL:GOLD",
        help="Comma-separated list of unified symbols to fetch.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=5,
        help="Number of recent days to fetch (inclusive).",
    )
    parser.add_argument(
        "--sources",
        type=str,
        default=None,
        help="Optional comma-separated source override (maps to INDEX_QUOTE_SOURCES).",
    )
    parser.add_argument(
        "--show-rows",
        type=int,
        default=3,
        help="Number of sample rows to display per symbol (0 to skip).",
    )
    return parser.parse_args()


def resolve_range(days: int) -> Tuple[date, date]:
    today = date.today()
    start = today - timedelta(days=max(days - 1, 0))
    return start, today


def fetch_for_symbols(symbols: Iterable[str], start: date, end: date) -> List[Tuple[str, pd.DataFrame]]:
    results: List[Tuple[str, pd.DataFrame]] = []
    for symbol in symbols:
        try:
            df = fetch_index_quotes(symbol, start=start, end=end)
        except Exception as exc:  # pragma: no cover - runtime validation
            print(f"[ERROR] {symbol}: fetch failed ({exc})")
            continue
        results.append((symbol, df))
    return results


def print_summary(data: List[Tuple[str, pd.DataFrame]], show_rows: int) -> None:
    for symbol, df in data:
        if df.empty:
            print(f"{symbol}: EMPTY")
            continue
        print(f"{symbol}: {len(df)} rows from {df['date'].min()} to {df['date'].max()}")
        if show_rows > 0:
            preview = df.head(show_rows)
            print(preview.to_string(index=False))
            print("-")


def main() -> None:
    args = parse_args()
    symbols = [part.strip() for part in args.symbols.split(",") if part.strip()]
    start, end = resolve_range(args.days)

    if args.sources:
        os.environ["INDEX_QUOTE_SOURCES"] = args.sources

    results = fetch_for_symbols(symbols, start, end)
    print(f"Fetched {len(results)} symbol(s) for window {start} -> {end}")
    print_summary(results, args.show_rows)


if __name__ == "__main__":
    main()

