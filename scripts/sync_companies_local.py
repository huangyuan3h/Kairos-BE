"""
Local script: Quarterly company sync for CN A-shares with checkpoint resume.

Behavior
--------
- Load CN A-share active symbols from MarketData catalog.
- Process strictly one symbol at a time.
- After each successful upsert, persist a checkpoint to resume later.
- Sleep a fixed delay between symbols to avoid upstream rate limits.
- Guard: if all financial fields are missing (effectively null), stop for manual check.

Usage
-----
python scripts/sync_companies_local.py

Optional flags:
  --checkpoint-file scripts/.company_sync_checkpoint
  --sleep-sec 10
  --max-symbols 100
  --no-financials

Notes
-----
- This script expects AWS credentials configured in your environment.
- It attempts to import the local "core" package. If not installed, it injects
  "core/src" into sys.path for local development runs.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Import core package (installed or local path fallback)
# ---------------------------------------------------------------------------
try:
    from core.database import MarketData, Company  # type: ignore
    from core.data_collector.stock.financials import (  # type: ignore
        build_company_item,
        fetch_latest_financials_flat,
    )
except Exception:  # noqa: BLE001
    ROOT = Path(__file__).resolve().parents[1]
    core_src = ROOT / "core" / "src"
    sys.path.insert(0, str(core_src))
    from core.database import MarketData, Company  # type: ignore
    from core.data_collector.stock.financials import (  # type: ignore
        build_company_item,
        fetch_latest_financials_flat,
    )


logger = logging.getLogger("sync_companies_local")
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------
def read_checkpoint(path: Path) -> Optional[str]:
    """Return last successful symbol from checkpoint file if exists.

    The file stores a simple JSON object: {"last_symbol": "SH600519"}
    """
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text().strip() or "{}")
        sym = data.get("last_symbol")
        return str(sym) if sym else None
    except Exception:  # noqa: BLE001
        return None


def write_checkpoint(path: Path, symbol: str) -> None:
    """Persist the last successful symbol to the checkpoint file (atomic write)."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps({"last_symbol": symbol}, ensure_ascii=False))
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------
def load_catalog(market_table: str, region: Optional[str], limit: Optional[int]) -> List[Dict[str, Any]]:
    """Load CN A-share active catalog and return list of rows (dict).

    Columns included: symbol, name, exchange, market, status
    """
    catalog = MarketData(table_name=market_table, region=region)
    df = catalog.query_stock_catalog_df(
        asset_type="stock",
        market="CN_A",
        status="active",
        columns=["symbol", "name", "exchange", "market", "status"],
        limit=limit,
    )
    if df is None or df.empty:  # type: ignore[truthy-bool]
        return []
    rows: List[Dict[str, Any]] = df.to_dict(orient="records")
    return rows


def slice_from_checkpoint(rows: List[Dict[str, Any]], start_after: Optional[str]) -> List[Dict[str, Any]]:
    """Return a sublist of rows starting after the given symbol (exclusive)."""
    if not start_after:
        return rows
    symbols = [str(r.get("symbol", "")) for r in rows]
    try:
        idx = symbols.index(str(start_after))
        return rows[idx + 1 :]
    except ValueError:
        return rows


def has_any_financial_field(metrics: Dict[str, Any]) -> bool:
    """Return True if at least one financial metric is present (non-empty dict).

    We treat an empty dict as "all null" for guard purposes.
    """
    return bool(metrics)


def process_symbol(company_repo: Company, row: Dict[str, Any], include_financials: bool) -> Tuple[str, Dict[str, Any]]:
    """Build item for a symbol, optionally enrich with financials, and upsert.

    Returns (symbol, item) upon success.
    """
    item = build_company_item(row)
    if include_financials:
        metrics = fetch_latest_financials_flat(item["pk"])  # pk uses canonical symbol
        # Guard: stop if all financial fields are effectively missing
        if not has_any_financial_field(metrics):
            raise RuntimeError(
                f"No financial metrics found for symbol={item['pk']}. Manual inspection required."
            )
        item.update(metrics)
    company_repo.put_company(item)
    return item["pk"], item


def run(
    *,
    company_table: str,
    market_table: str,
    checkpoint_file: Path,
    sleep_sec: float,
    max_symbols: Optional[int],
    include_financials: bool,
) -> None:
    # Hardcode region for all DynamoDB operations
    region = "us-east-1"
    company_repo = Company(table_name=company_table, region=region)

    rows = load_catalog(market_table=market_table, region=region, limit=max_symbols)
    if not rows:
        logger.info("No catalog rows found. Exiting.")
        return

    last = read_checkpoint(checkpoint_file)
    if last:
        logger.info("Resuming after last symbol: %s", last)
    todo = slice_from_checkpoint(rows, last)
    logger.info("Total symbols to process: %d", len(todo))

    for idx, row in enumerate(todo, start=1):
        symbol = str(row.get("symbol", "")).strip().upper()
        try:
            logger.info("[%d/%d] Upserting company: %s", idx, len(todo), symbol)
            pk, _ = process_symbol(company_repo, row, include_financials)
            write_checkpoint(checkpoint_file, pk)
            logger.info("Checkpoint written: %s", pk)
        except KeyboardInterrupt:
            logger.warning("Interrupted by user. Last processed: %s", read_checkpoint(checkpoint_file))
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed processing symbol=%s error=%s", symbol, str(exc))
            # Stop immediately to allow manual inspection as requested
            raise

        # Fixed politeness delay after each record
        time.sleep(max(0.0, float(sleep_sec)))


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync CN companies locally with checkpoint resume")
    # Defaults to prod resources
    parser.add_argument("--company-table", default=os.getenv("COMPANY_TABLE", "kairos-be-prod-CompanyTable"))
    parser.add_argument("--market-table", default=os.getenv("MARKET_DATA_TABLE", "kairos-be-prod-MarketDataTable"))
    parser.add_argument("--checkpoint-file", default=str(Path("scripts/.company_sync_checkpoint")))
    parser.add_argument("--sleep-sec", type=float, default=float(os.getenv("SLEEP_SEC", "10")))
    parser.add_argument("--max-symbols", type=int, default=None)
    parser.add_argument("--no-financials", action="store_true", help="Do not fetch financial metrics")
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = parse_args()
    try:
        run(
            company_table=str(args.company_table),
            market_table=str(args.market_table),
            checkpoint_file=Path(str(args.checkpoint_file)).resolve(),
            sleep_sec=float(args.sleep_sec),
            max_symbols=int(args.max_symbols) if args.max_symbols else None,
            include_financials=(not bool(args.no_financials)),
        )
    except KeyboardInterrupt:
        logger.info("Exiting on user interrupt.")
    except Exception as exc:  # noqa: BLE001
        # Surface the error for visibility in terminal and non-zero exit
        logger.exception("Sync terminated with error: %s", str(exc))
        sys.exit(2)


