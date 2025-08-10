from __future__ import annotations

from typing import Optional, TypedDict


class BaseItem(TypedDict, total=False):
    """Common attributes for single-table items."""

    pk: str
    sk: str
    # Symbol index
    gsi1pk: str
    gsi1sk: str
    # Market+status index
    gsi2pk: str
    gsi2sk: str

    # Common descriptive attributes
    symbol: str
    name: str
    exchange: str
    asset_type: str
    market: str
    status: str


class PutResult(TypedDict, total=False):
    consumed_capacity: Optional[float]


class UpdateResult(TypedDict, total=False):
    attributes: Optional[BaseItem]
