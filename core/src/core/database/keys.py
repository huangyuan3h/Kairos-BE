from __future__ import annotations

from datetime import date
from typing import Optional


def _concat(*parts: Optional[str]) -> str:
    return "#".join(str(p) for p in parts if p is not None and p != "")


def make_pk_stock(symbol: str) -> str:
    """Partition key for stock-level entities."""
    return _concat("STOCK", symbol)


def make_pk_index(symbol: str) -> str:
    """Partition key for index-level entities (stored in IndexData table).

    Using a distinct prefix to keep semantics explicit even across tables.
    """
    return _concat("INDEX", symbol)


def make_sk_meta(entity_type: str, timestamp_iso: Optional[str] = None) -> str:
    """Sort key for metadata entities.

    Example: META#PROFILE#2025-01-01T00:00:00Z
    """
    return _concat("META", entity_type, timestamp_iso)


def make_sk_quote_date(quote_date: date) -> str:
    """Sort key for quote/price data on a given date.

    Example: QUOTE#2025-08-08
    """
    return _concat("QUOTE", quote_date.isoformat())


def make_gsi1pk_symbol(symbol: str) -> str:
    """GSI1 PK for symbol-based access pattern."""
    return _concat("SYMBOL", symbol)


def make_gsi1sk_entity(entity: str, timestamp_iso: Optional[str] = None) -> str:
    """GSI1 SK for symbol-entity timeline queries."""
    return _concat("ENTITY", entity, timestamp_iso)


def make_gsi2pk_market_status(market: str, status: str) -> str:
    """GSI2 PK for market and status access pattern."""
    return _concat("MARKET", market, "STATUS", status)


def make_gsi2sk_entity(entity: str, timestamp_iso: Optional[str] = None) -> str:
    """GSI2 SK for market-status entity timeline queries."""
    return _concat("ENTITY", entity, timestamp_iso)
