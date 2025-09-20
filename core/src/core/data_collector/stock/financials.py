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
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import os
import threading

import pandas as pd  # type: ignore
import akshare as ak  # type: ignore
import hashlib
import random
import time
logger = logging.getLogger(__name__)

# ---------------- Global fetch rate limiter (shared per Lambda) ----------------
_rate_lock = threading.Lock()
_last_fetch_ts: float = 0.0
try:
    _RPS = float(os.getenv("UPSTREAM_RPS", "2"))  # average requests per second per shard
    if _RPS <= 0:
        _RPS = 1.0
except Exception:
    _RPS = 2.0


def _global_fetch_gate() -> None:
    """Serialize external fetches to respect average RPS across threads.

    This is a simple leaky-bucket: ensure at least 1/RPS seconds gap
    between two fetches globally in the process.
    """
    global _last_fetch_ts
    gap = 1.0 / max(0.1, _RPS)
    with _rate_lock:
        now = time.time()
        wait = _last_fetch_ts + gap - now
        if wait > 0:
            time.sleep(wait)
            now = time.time()
        _last_fetch_ts = now
def pad_score(score: float) -> str:
    """Left-pad score for lexical ordering in GSI sort key."""
    # Use width=9 to ensure five digits before decimal for 0.000 -> "00000.000"
    return f"{score:09.3f}"


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
    item: Dict[str, Any] = {
        "pk": symbol,
        "gsi1pk": "SCORE",
        "gsi1sk": f"{pad_score(score)}#{symbol}",
        "symbol": symbol,
        "name": row.get("name"),
        "score": score,
    }
    return item


def to_code6(canonical_symbol: str) -> str:
    s = str(canonical_symbol).strip().upper()
    if len(s) >= 8 and (s.startswith("SH") or s.startswith("SZ") or s.startswith("BJ")):
        return s[2:]
    return s


def _fetch_statement_df(code6: str, statement: str) -> Optional[pd.DataFrame]:
    """Fetch a single financial statement with minimal retries and backoff."""
    max_attempts = 5
    base_delay = 1.0
    for attempt in range(1, max_attempts + 1):
        try:
            _global_fetch_gate()
            df = ak.stock_financial_report_sina(stock=code6, symbol=statement)
            if df is None or df.empty:
                raise RuntimeError("empty dataframe")
            # Normalize column names
            df.columns = [str(c).strip() for c in df.columns]
            return df
        except Exception as exc:  # noqa: BLE001
            if attempt >= max_attempts:
                logger.warning(
                    "fetch_statement_failed: code6=%s stmt=%s attempt=%d error=%s",
                    code6,
                    statement,
                    attempt,
                    str(exc),
                )
                return None
            delay = base_delay * (2 ** (attempt - 1)) + random.uniform(0.0, 0.7)
            time.sleep(delay)
    return None


def _select_period_col(df: pd.DataFrame) -> Optional[str]:
    for name in ["报告期", "截止日期", "日期", "报表期"]:
        if name in df.columns:
            return name
    return None


def _coerce_numeric_series(s: pd.Series) -> Optional[float]:
    try:
        v = pd.to_numeric(s, errors="coerce")
        if pd.isna(v):
            return None
        return float(v)
    except Exception:
        return None


def fetch_latest_financials_flat(symbol: str) -> Dict[str, Any]:
    """Fetch latest rows from three statements and flatten numeric fields.

    Keys are flattened with prefixes: inc_, bs_, cf_. Chinese column names are
    preserved after the prefix to minimize mapping complexity.
    """
    code6 = to_code6(symbol)
    result: Dict[str, Any] = {}
    # Whitelists for quant-useful fields
    # Minimal, high-coverage income statement fields
    income_map: Dict[str, str] = {
        "营业收入": "revenue",
        "营业利润": "operating_income",
        "利润总额": "pretax_income",
        "净利润": "net_income",
        "基本每股收益": "eps_basic",
        "稀释每股收益": "eps_diluted",
    }
    # Minimal, high-coverage balance sheet fields
    balance_map: Dict[str, str] = {
        "资产总计": "total_assets",
        "负债合计": "total_liabilities",
        "所有者权益(或股东权益)合计": "total_equity",
        "资本公积": "additional_paid_in_capital",
        "盈余公积": "surplus_reserve",
        "未分配利润": "retained_earnings",
    }
    # Minimal, high-coverage cash flow fields
    cashflow_map: Dict[str, str] = {
        "经营活动产生的现金流量净额": "net_cash_from_operating",
        "投资活动产生的现金流量净额": "net_cash_from_investing",
        "筹资活动产生的现金流量净额": "net_cash_from_financing",
        "支付给职工以及为职工支付的现金": "cash_out_employees",
        "支付的各项税费": "cash_out_taxes",
        "期末现金及现金等价物余额": "ending_cash_and_equivalents",
        "现金及现金等价物净增加额": "net_increase_in_cash",
    }

    for stmt, prefix, mapping in (
        ("利润表", "inc_", income_map),
        ("资产负债表", "bs_", balance_map),
        ("现金流量表", "cf_", cashflow_map),
    ):
        df = _fetch_statement_df(code6, stmt)
        if df is None or df.empty:
            continue
        period_col = _select_period_col(df)
        latest = df.iloc[0] if period_col is None else df.sort_values(by=period_col, ascending=False).iloc[0]
        for col in df.columns:
            if col == period_col:
                continue
            eng = mapping.get(col)
            if eng is None:
                continue
            val = _coerce_numeric_series(latest[col])
            if val is None:
                continue
            key = f"{prefix}{eng}"
            result[key] = val
    return result


def sync_companies_for_shard(
    *,
    company_put: Callable[[Dict[str, Any]], None],
    get_catalog_df: Callable[[], pd.DataFrame],
    shard_total: int = 1,
    shard_index: int = 0,
    max_symbols: int = 0,
    max_concurrency: int = 1,
    include_financials: bool = True,
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
        return {"companies_upserted": 0, "total_symbols": 0, "failed": 0, "skipped": True}

    symbols: List[str] = cat_df["symbol"].astype(str).dropna().drop_duplicates().tolist()
    if shard_total > 1:
        symbols = [s for s in symbols if shard_ok(s, shard_total, shard_index)]
    if max_symbols and max_symbols > 0:
        symbols = symbols[:max_symbols]

    results: List[Dict[str, Any]] = []
    total = len(symbols)
    errors_sample: List[Dict[str, Any]] = []
    ok_count = 0

    # Iterate over filtered subset by index positions for stable mapping
    idx_map = [i for i, s in enumerate(cat_df["symbol"].astype(str).tolist()) if s in set(symbols)]

    # Sequential path (default)
    if max_concurrency is None or max_concurrency <= 1:
        for i, idx in enumerate(idx_map):
            try:
                item = build_company_item(cat_df.iloc[idx])
                if include_financials:
                    metrics = fetch_latest_financials_flat(item["pk"])  # pk is canonical symbol
                    # Merge flattened financial fields into the same row
                    item.update(metrics)
                company_put(item)
                ok_count += 1
            except Exception as e:  # noqa: BLE001
                sym = str(cat_df.iloc[idx].get("symbol"))
                logger.error("company_upsert_failed: symbol=%s error=%s", sym, str(e))
                if len(errors_sample) < 10:
                    errors_sample.append({"symbol": sym, "error": str(e)})
            rate_limit_pause(i)
    else:
        # Concurrent path with bounded thread pool
        max_workers = max(1, int(max_concurrency))

        def _work(seq_and_idx: Any) -> Dict[str, Any]:
            i, idx = seq_and_idx
            try:
                item = build_company_item(cat_df.iloc[idx])
                if include_financials:
                    metrics = fetch_latest_financials_flat(item["pk"])  # pk is canonical symbol
                    item.update(metrics)
                company_put(item)
                return {"symbol": item["symbol"], "ok": True}
            except Exception as e:  # noqa: BLE001
                return {"symbol": str(cat_df.iloc[idx].get("symbol")), "ok": False, "error": str(e)}
            finally:
                # Preserve jitter even under concurrency to avoid upstream rate spikes
                rate_limit_pause(i)

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_work, pair) for pair in enumerate(idx_map)]
            for fut in as_completed(futures):
                try:
                    res = fut.result()
                    if res.get("ok"):
                        ok_count += 1
                    else:
                        if len(errors_sample) < 10:
                            errors_sample.append({"symbol": res.get("symbol"), "error": res.get("error")})
                    results.append(res)
                except Exception as e:  # noqa: BLE001
                    # Should not happen as _work already catches, but guard anyway
                    logger.error("company_upsert_failed: symbol=%s error=%s", "?", str(e))
                    if len(errors_sample) < 10:
                        errors_sample.append({"symbol": "?", "error": str(e)})
                    results.append({"symbol": "?", "ok": False, "error": str(e)})

    fail_count = len(idx_map) - ok_count
    return {
        "companies_upserted": ok_count,
        "total_symbols": total,
        "failed": fail_count,
        "errors_sample": errors_sample,
    }

__all__ = [
    "pad_score",
    "shard_ok",
    "rate_limit_pause",
    "build_company_item",
    "fetch_latest_financials_flat",
    "sync_companies_for_shard",
]


