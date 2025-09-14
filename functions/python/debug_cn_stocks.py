"""
Quick debug runner to fetch CN A-share daily quotes and print the DataFrame.

Usage examples:
  python functions/python/debug_cn_stocks.py --symbol SH600519 --days 5
  python functions/python/debug_cn_stocks.py --symbols SH600519,SZ000001 --days 3 --end 2025-01-10
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import sys
from pathlib import Path

import pandas as pd  # type: ignore[import]

# Ensure local 'core/src' is importable without installing the package
REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_SRC = REPO_ROOT / "core" / "src"
if str(CORE_SRC) not in sys.path:
    sys.path.insert(0, str(CORE_SRC))

from core.data_collector.stock.daily_quotes import build_cn_stock_quotes_df  # type: ignore  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Debug CN A-share quotes fetcher")
    parser.add_argument("--symbol", type=str, help="Single symbol like SH600519")
    parser.add_argument("--symbols", type=str, help="Comma-separated symbols, e.g., SH600519,SZ000001")
    parser.add_argument("--days", type=int, default=5, help="Lookback window in days (default: 5)")
    parser.add_argument("--end", type=str, help="End date ISO (YYYY-MM-DD). Default: today")
    return parser.parse_args()


def parse_date(s: str | None) -> date:
    if not s:
        return date.today()
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))


def main() -> None:
    args = parse_args()
    end = parse_date(args.end)
    start = end - timedelta(days=max(0, args.days - 1))

    symbols: list[str] = []
    if args.symbol:
        symbols.append(args.symbol.strip())
    if args.symbols:
        symbols.extend([s.strip() for s in args.symbols.split(",") if s.strip()])
    if not symbols:
        symbols = ["SH600519"]

    print(f"Fetching range: {start} -> {end}; symbols={symbols}")

    frames: list[pd.DataFrame] = []
    for sym in symbols:
        df = build_cn_stock_quotes_df(sym, start=start, end=end)
        print(f"\n=== {sym} ===")
        if df is None or df.empty:
            print("[EMPTY]")
            continue
        # Show quick stats
        print("Columns:", list(df.columns))
        print("Shape:", df.shape)
        print("Head:\n", df.head(10))
        print("NA counts:\n", df.isna().sum())
        frames.append(df)

    if frames:
        all_df = pd.concat(frames, ignore_index=True)
        print("\n=== MERGED ===")
        print("Merged shape:", all_df.shape)
        print("Sample:\n", all_df.head(20))


if __name__ == "__main__":
    main()


