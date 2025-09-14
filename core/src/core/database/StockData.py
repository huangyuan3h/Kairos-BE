from __future__ import annotations

from typing import Any, Dict, List, Optional
from decimal import Decimal

import pandas as pd  # type: ignore[import]

from .client import DynamoConfig, get_dynamo_table
from .keys import make_pk_stock, make_sk_quote_date, make_gsi1pk_symbol, make_gsi1sk_entity
from .repository import DynamoRepository
from .exceptions import RepositoryError


class StockData:
    """Service for equity daily quotes stored in StockData table.

    Keys
    ----
    - pk = STOCK#<symbol>
    - sk = QUOTE#YYYY-MM-DD
    - gsi1: symbol timeline (gsi1pk = SYMBOL#<symbol>, gsi1sk = ENTITY#QUOTE#<date>)
    """

    def __init__(self, table_name: str, region: Optional[str] = None) -> None:
        config = DynamoConfig(table_name=table_name, region=region)
        table = get_dynamo_table(config)
        self._repo = DynamoRepository(table)

    def upsert_quotes_df(self, df: pd.DataFrame) -> int:
        required = {"symbol", "date", "open", "high", "low", "close"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {sorted(missing)}")

        normalized = df.copy()
        if not pd.api.types.is_datetime64_any_dtype(normalized["date"]):
            normalized["date"] = pd.to_datetime(normalized["date"], errors="coerce")
        normalized = normalized.dropna(subset=["date"]).copy()
        normalized["date"] = normalized["date"].dt.date

        records: List[Dict[str, Any]] = normalized.to_dict(orient="records")
        items: List[Dict[str, Any]] = []

        def _opt_decimal(v: Any) -> Optional[Decimal]:
            try:
                if v is None:
                    return None
                if pd.isna(v):
                    return None
                return Decimal(str(v))
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

        for row in records:
            symbol = str(row["symbol"]).strip()
            d = row["date"]
            sk = make_sk_quote_date(d)
            gsi1sk = make_gsi1sk_entity("QUOTE", getattr(d, "isoformat", lambda: str(d))())

            item: Dict[str, Any] = {
                "pk": make_pk_stock(symbol),
                "sk": sk,
                "gsi1pk": make_gsi1pk_symbol(symbol),
                "gsi1sk": gsi1sk,
                "symbol": symbol,
                "date": getattr(d, "isoformat", lambda: str(d))(),
            }
            open_v = _opt_decimal(row.get("open"))
            if open_v is not None:
                item["open"] = open_v
            high_v = _opt_decimal(row.get("high"))
            if high_v is not None:
                item["high"] = high_v
            low_v = _opt_decimal(row.get("low"))
            if low_v is not None:
                item["low"] = low_v
            close_v = _opt_decimal(row.get("close"))
            if close_v is not None:
                item["close"] = close_v
            adj_v = _opt_decimal(row.get("adj_close"))
            if adj_v is not None:
                item["adj_close"] = adj_v
            vol_v = _opt_int(row.get("volume"))
            if vol_v is not None:
                item["volume"] = vol_v
            curr = row.get("currency")
            if curr is not None and not pd.isna(curr):
                item["currency"] = str(curr)
            src = row.get("source")
            if src is not None and not pd.isna(src):
                item["source"] = str(src)
            items.append(item)

        try:
            self._repo.batch_put(items)
            return len(items)
        except RepositoryError:
            raise

    def get_latest_quote_date(self, symbol: str) -> Optional[str]:
        items = self._repo.query_by_symbol(
            symbol_pk=make_gsi1pk_symbol(symbol.strip()),
            begins_with_prefix="ENTITY#QUOTE",
            limit=1,
            scan_forward=False,
        )
        if not items:
            return None
        d = items[0].get("date")
        return str(d) if d is not None else None


