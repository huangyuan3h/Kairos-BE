"""
Business orchestration helpers for company sync and simple scoring storage.

This module focuses on:
- Sharding, rate-limiting, and single-row-per-company item construction
- Minimal utilities required by the Lambda entrypoint

Note: Historical statement fetchers were intentionally removed to keep
the scope minimal and cost-efficient for the current use-case.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

import pandas as pd  # type: ignore
import hashlib
import random
import time


 


def pad_score(score: float) -> str:
    """Left-pad score for lexical ordering in GSI sort key."""
    return f"{score:08.3f}"


def shard_ok(symbol: str, shard_total: int, shard_index: int) -> bool:
    """Return True if symbol belongs to this shard by md5 partitioning."""
    norm = str(symbol).strip().upper()
    h = int(hashlib.md5(norm.encode("utf-8")).hexdigest(), 16)
    return (h % max(1, shard_total)) == shard_index


def rate_limit_pause(i: int) -> None:
    """Sleep a short jitter every request; occasionally a longer pause."""
    time.sleep(random.uniform(0.2, 0.6))
    if (i + 1) % 20 == 0:
        time.sleep(random.uniform(3.0, 8.0))


def build_company_item(row: Any, default_score: float = 0.0) -> Dict[str, Any]:
    """Build a single-row company item with score-based GSI keys.

    The primary key is the canonical symbol (e.g., SH600519). Only latest
    snapshot is kept; upserts are idempotent via the same pk.
    """
    symbol = str(row.get("symbol", "")).strip().upper()
    score = float(default_score)
    return {
        "pk": symbol,
        "gsi1pk": "SCORE",
        "gsi1sk": f"{pad_score(score)}#{symbol}",
        "symbol": symbol,
        "name": row.get("name"),
        "exchange": row.get("exchange"),
        "market": row.get("market"),
        "status": row.get("status"),
        "score": score,
        "source": "catalog:MarketData",
    }


def sync_companies_for_shard(
    *,
    company_put: Callable[[Dict[str, Any]], None],
    get_catalog_df: Callable[[], pd.DataFrame],
    shard_total: int = 1,
    shard_index: int = 0,
    max_symbols: int = 0,
) -> Dict[str, Any]:
    """Business orchestration: sync one-row-per-company for this shard.

    Parameters
    ----------
    company_put: callable(dict) -> None
        Function that upserts a company row (usually Company.put_company).
    get_catalog_df: callable() -> pd.DataFrame
        Function returning CN catalog dataframe with symbol/name/exchange/market/status.
    shard_total, shard_index: int
        Sharding controls, consistent with scheduler.
    max_symbols: int
        Limit number of symbols for dry-run/testing. 0 or negative disables limiting.
    """
    cat_df: Optional[pd.DataFrame] = get_catalog_df()
    if cat_df is None or cat_df.empty:
        return {"count": 0, "skipped": True, "results": []}

    symbols: List[str] = cat_df["symbol"].astype(str).dropna().drop_duplicates().tolist()
    if shard_total > 1:
        symbols = [s for s in symbols if shard_ok(s, shard_total, shard_index)]
    if max_symbols and max_symbols > 0:
        symbols = symbols[:max_symbols]

    results: List[Dict[str, Any]] = []
    total = len(symbols)

    # Iterate over filtered subset by index positions for stable mapping
    idx_map = [i for i, s in enumerate(cat_df["symbol"].astype(str).tolist()) if s in set(symbols)]
    for i, idx in enumerate(idx_map):
        try:
            item = build_company_item(cat_df.iloc[idx])
            company_put(item)
            results.append({"symbol": item["symbol"], "ok": True})
        except Exception as e:  # noqa: BLE001
            results.append({"symbol": str(cat_df.iloc[idx].get("symbol")), "ok": False, "error": str(e)})
        rate_limit_pause(i)

    ok_count = sum(1 for r in results if r.get("ok"))
    return {"companies_upserted": ok_count, "total_symbols": total, "results": results}

__all__ = [
    "to_akshare_code",
    "derive_fiscal_from_date",
    "fetch_statement_df",
    "select_period_end_column",
]


