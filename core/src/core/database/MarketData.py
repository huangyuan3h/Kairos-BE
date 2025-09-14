"""
Module: MarketData service

Example: How an Apple stock catalog record is stored (upserted)

Given a DataFrame row like:
{
  "symbol": "AAPL",
  "name": "Apple Inc.",
  "exchange": "NASDAQ",
  "asset_type": "EQUITY",
  "market": "US",
  "status": "ACTIVE"
}

The resulting DynamoDB item (single-table design) will be:
{
  "pk":    "STOCK#AAPL",                 # Primary partition key
  "sk":    "META#CATALOG",               # Stable sort key for latest catalog

  "gsi1pk": "SYMBOL#AAPL",               # GSI1 (bySymbol) hash key
  "gsi1sk": "ENTITY#CATALOG",            # GSI1 range for entity scoping

  "gsi2pk": "MARKET#US#STATUS#ACTIVE",   # GSI2 (byMarketStatus) hash key
  "gsi2sk": "ENTITY#CATALOG",            # GSI2 range for entity scoping

  "symbol": "AAPL",
  "name": "Apple Inc.",
  "exchange": "NASDAQ",
  "asset_type": "EQUITY",
  "market": "US",
  "status": "ACTIVE"
}

Query patterns enabled by this layout:
- bySymbol (GSI1):  gsi1pk = SYMBOL#AAPL; optional begins_with(gsi1sk, "ENTITY#CATALOG")
- byMarketStatus (GSI2): gsi2pk = MARKET#US#STATUS#ACTIVE; optional begins_with(gsi2sk, "ENTITY#CATALOG")
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd  # type: ignore[import]

from .client import DynamoConfig, get_dynamo_table
from .keys import (
    make_pk_stock,
    make_sk_meta,
    make_sk_quote_date,
    make_gsi1pk_symbol,
    make_gsi1sk_entity,
    make_gsi2pk_market_status,
    make_gsi2sk_entity,
)
from .repository import DynamoRepository
from .exceptions import RepositoryError


class MarketData:
    """High-level service for market data persistence.

    Provides batch upsert operations from tabular sources like Pandas DataFrame.
    """

    def __init__(self, table_name: str, region: Optional[str] = None) -> None:
        config = DynamoConfig(table_name=table_name, region=region)
        table = get_dynamo_table(config)
        self._repo = DynamoRepository(table)

    def upsert_stock_catalog(self, df: pd.DataFrame) -> int:
        """Upsert stock catalog records from a DataFrame.

        The DataFrame is expected to contain the following columns:
        - symbol, name, exchange, asset_type, market, status

        Notes
        -----
        This method performs an upsert via PutItem (overwrite semantics).
        It computes PK/SK and GSI keys according to the single-table design.
        """
        required = {"symbol", "name", "exchange", "asset_type", "market", "status"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        records: List[Dict[str, Any]] = df.to_dict(orient="records")
        items: List[Dict[str, Any]] = []

        for row in records:
            symbol = str(row["symbol"]).strip()
            market = str(row["market"]).strip()
            status = str(row["status"]).strip()

            item: Dict[str, Any] = {
                # Primary keys
                "pk": make_pk_stock(symbol),
                # Use a stable SK (no timestamp) for latest catalog/profile
                "sk": make_sk_meta("CATALOG"),
                # GSI1: by symbol
                "gsi1pk": make_gsi1pk_symbol(symbol),
                "gsi1sk": make_gsi1sk_entity("CATALOG"),
                # GSI2: by market + status
                "gsi2pk": make_gsi2pk_market_status(market, status),
                "gsi2sk": make_gsi2sk_entity("CATALOG"),
                # Descriptive attributes
                "symbol": symbol,
                "name": str(row["name"]).strip(),
                "exchange": str(row["exchange"]).strip(),
                "asset_type": str(row["asset_type"]).strip(),
                "market": market,
                "status": status,
            }
            items.append(item)

        try:
            self._repo.batch_put(items)
            return len(items)
        except RepositoryError:
            # Re-raise to keep the exception type stable for callers
            raise

    def get_stock_catalog_by_symbol(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch a single stock catalog record by symbol using primary key.

        This reads the stable latest catalog snapshot under SK = META#CATALOG.
        """
        pk = make_pk_stock(symbol.strip())
        sk = make_sk_meta("CATALOG")
        return self._repo.get_item(pk, sk)

    def query_stock_catalog_df(
        self,
        asset_type: str,
        market: str,
        status: str,
        columns: Optional[List[str]] = None,
        limit: Optional[int] = None,
    ) -> pd.DataFrame:
        """Query stock catalog by filters and return a DataFrame.

        Strategy
        --------
        Query GSI2 (byMarketStatus) using MARKET#<market>#STATUS#<status>,
        then filter client-side by asset_type. Optionally limit and select columns.
        """
        gsi_pk = make_gsi2pk_market_status(market.strip(), status.strip())
        items = self._repo.query_by_market_status(
            market_status_pk=gsi_pk,
            begins_with_prefix="ENTITY#CATALOG",
            limit=limit,
            scan_forward=True,
        )
        filtered = [
            it for it in items if str(it.get("asset_type", "")).strip() == asset_type.strip()
        ]
        df = pd.DataFrame(filtered)
        if columns:
            existing_cols = [c for c in columns if c in df.columns]
            return df[existing_cols]
        return df

    # ---------------- Quotes (daily OHLCV) ----------------
    def upsert_quotes_df(self, df: pd.DataFrame) -> int:
        """Upsert daily quotes from a DataFrame.

        Expected columns (required):
        - symbol: unified symbol
        - date: ISO date (YYYY-MM-DD) or datetime (date portion used)
        - open, high, low, close
        Optional:
        - adj_close, volume, currency, source
        """
        required = {"symbol", "date", "open", "high", "low", "close"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        normalized = df.copy()
        # Ensure date is date
        if not pd.api.types.is_datetime64_any_dtype(normalized["date"]):
            normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce")
        normalized = normalized.dropna(subset=["date"]).copy()
        normalized["date"] = normalized["date"].dt.date

        records: List[Dict[str, Any]] = normalized.to_dict(orient="records")
        items: List[Dict[str, Any]] = []
        for row in records:
            symbol = str(row["symbol"]).strip()
            d = row["date"]
            sk = make_sk_quote_date(d)
            # Build GSI1 timeline for quotes: ENTITY#QUOTE#YYYY-MM-DD
            gsi1sk = make_gsi1sk_entity("QUOTE", getattr(d, "isoformat", lambda: str(d))())

            # Safe conversions
            def _opt_float(v: Any) -> Optional[float]:
                try:
                    if v is None:
                        return None
                    f = float(v)
                    return None if pd.isna(f) else f
                except Exception:
                    return None

            def _opt_int(v: Any) -> Optional[int]:
                try:
                    if v is None:
                        return None
                    if pd.isna(v):
                        return None
                    return int(float(v))
                except Exception:
                    return None

            item: Dict[str, Any] = {
                "pk": make_pk_stock(symbol),
                "sk": sk,
                "gsi1pk": make_gsi1pk_symbol(symbol),
                "gsi1sk": gsi1sk,
                # Descriptive
                "symbol": symbol,
                "date": getattr(d, "isoformat", lambda: str(d))(),
                "open": _opt_float(row.get("open")),
                "high": _opt_float(row.get("high")),
                "low": _opt_float(row.get("low")),
                "close": _opt_float(row.get("close")),
                "adj_close": _opt_float(row.get("adj_close")),
                "volume": _opt_int(row.get("volume")),
                "currency": None if pd.isna(row.get("currency")) else str(row.get("currency")),
                "source": None if pd.isna(row.get("source")) else str(row.get("source")),
            }
            items.append(item)

        try:
            self._repo.batch_put(items)
            return len(items)
        except RepositoryError:
            raise

    def get_latest_quote_date(self, symbol: str) -> Optional[str]:
        """Return latest available quote date (YYYY-MM-DD) for symbol via GSI1 timeline.

        Uses bySymbol index with begins_with("ENTITY#QUOTE") and ScanIndexForward=False.
        """
        items = self._repo.query_by_symbol(
            symbol_pk=make_gsi1pk_symbol(symbol.strip()),
            begins_with_prefix="ENTITY#QUOTE",
            limit=1,
            scan_forward=False,
        )
        if not items:
            return None
        # date stored as attribute 'date'
        d = items[0].get("date")
        return str(d) if d is not None else None
