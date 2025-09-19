from __future__ import annotations

"""
Debug script: fetch and display flattened financial columns for a company.

Usage
-----
python -m core.data_collector.stock.scripts.debug_financials_flat SH600519

If no symbol is provided, defaults to SH600519.
"""

import json
import sys
from typing import Dict, Any

from core.data_collector.stock.financials import fetch_latest_financials_flat


def main() -> int:
    symbol = sys.argv[1].strip().upper() if len(sys.argv) > 1 else "SH600519"
    data: Dict[str, Any] = fetch_latest_financials_flat(symbol)

    inc_cols = sorted([k for k in data.keys() if k.startswith("inc_")])
    bs_cols = sorted([k for k in data.keys() if k.startswith("bs_")])
    cf_cols = sorted([k for k in data.keys() if k.startswith("cf_")])

    print(f"Symbol: {symbol}")
    print(f"Total numeric fields: {len(data)}")
    print(f"Income statement fields ({len(inc_cols)}):")
    print("  " + ", ".join(inc_cols))
    print(f"Balance sheet fields ({len(bs_cols)}):")
    print("  " + ", ".join(bs_cols))
    print(f"Cash flow fields ({len(cf_cols)}):")
    print("  " + ", ".join(cf_cols))

    # Print a compact JSON sample (trim values for readability)
    preview = {k: data[k] for k in sorted(data.keys())[: min(20, len(data))]}
    print("\nSample (first 20 fields):")
    print(json.dumps(preview, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


