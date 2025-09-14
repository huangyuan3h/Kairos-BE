# pyright: reportMissingTypeStubs=false
"""Database access layer package.

Exposes high-level DynamoDB repository and helpers.
"""
from .client import DynamoConfig, get_dynamo_table
from .keys import (
    make_pk_stock,
    make_pk_index,
    make_sk_meta,
    make_sk_quote_date,
    make_gsi1pk_symbol,
    make_gsi1sk_entity,
    make_gsi2pk_market_status,
    make_gsi2sk_entity,
)
from .repository import DynamoRepository
from .exceptions import RepositoryError
from .MarketData import MarketData
from .IndexData import IndexData
from .StockData import StockData

__all__ = [
    "DynamoConfig",
    "get_dynamo_table",
    "DynamoRepository",
    "RepositoryError",
    "MarketData",
    "IndexData",
    "StockData",
    "make_pk_stock",
    "make_pk_index",
    "make_sk_meta",
    "make_sk_quote_date",
    "make_gsi1pk_symbol",
    "make_gsi1sk_entity",
    "make_gsi2pk_market_status",
    "make_gsi2sk_entity",
]
