from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence
import os
from decimal import Decimal
from datetime import date

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

        # Whether to include extended/optional fields to save cost on writes and storage.
        # Default: False (only essential OHLCV fields will be written)
        write_extended = (
            os.getenv("STOCKDATA_WRITE_EXTENDED_FIELDS", "false").lower() in ["1", "true", "yes"]
        )

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

            if write_extended:
                # Optional market microstructure and status fields (costly; disabled by default)
                amt_v = _opt_decimal(row.get("turnover_amount"))
                if amt_v is not None:
                    item["turnover_amount"] = amt_v
                rate_v = _opt_decimal(row.get("turnover_rate"))
                if rate_v is not None:
                    item["turnover_rate"] = rate_v
                vwap_v = _opt_decimal(row.get("vwap"))
                if vwap_v is not None:
                    item["vwap"] = vwap_v
                up_v = _opt_decimal(row.get("limit_up"))
                if up_v is not None:
                    item["limit_up"] = up_v
                down_v = _opt_decimal(row.get("limit_down"))
                if down_v is not None:
                    item["limit_down"] = down_v
                # Booleans/strings
                susp = row.get("is_suspended")
                if susp is not None and not pd.isna(susp):
                    item["is_suspended"] = bool(susp)
                status = row.get("trading_status")
                if status is not None and not pd.isna(status):
                    item["trading_status"] = str(status)
                factor_v = _opt_decimal(row.get("adj_factor"))
                if factor_v is not None:
                    item["adj_factor"] = factor_v
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

    def get_quotes_df(
        self,
        symbol: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        fields: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        """Fetch quotes for a single symbol as a DataFrame sorted by date."""

        symbol_norm = str(symbol).strip().upper()
        symbol_pk = make_gsi1pk_symbol(symbol_norm)
        items = self._repo.query_by_symbol(
            symbol_pk=symbol_pk,
            begins_with_prefix="ENTITY#QUOTE",
            scan_forward=True,
        )

        if not items:
            columns = ["date", "symbol"] + list(fields or [])
            return pd.DataFrame(columns=columns)

        selected_fields: Sequence[str]
        if fields:
            selected_fields = list(dict.fromkeys(fields))  # deduplicate while preserving order
        else:
            selected_fields = [
                "open",
                "high",
                "low",
                "close",
                "adj_close",
                "volume",
                "turnover_amount",
                "turnover_rate",
                "vwap",
                "adj_factor",
            ]

        def _convert(value: Any) -> Any:
            if isinstance(value, Decimal):
                return float(value)
            if isinstance(value, list):
                return [_convert(v) for v in value]
            if isinstance(value, dict):
                return {k: _convert(v) for k, v in value.items()}
            return value

        rows: List[Dict[str, Any]] = []
        for item in items:
            dt_raw = item.get("date")
            if not dt_raw:
                continue
            try:
                dt = date.fromisoformat(str(dt_raw))
            except ValueError:
                continue
            if start_date and dt < start_date:
                continue
            if end_date and dt > end_date:
                continue

            row: Dict[str, Any] = {"date": dt, "symbol": symbol_norm}
            for fld in selected_fields:
                if fld in item:
                    row[fld] = _convert(item[fld])
            rows.append(row)

        if not rows:
            columns = ["date", "symbol"] + list(selected_fields)
            return pd.DataFrame(columns=columns)

        df = pd.DataFrame(rows)
        df.sort_values("date", inplace=True)
        return df.reset_index(drop=True)

    def get_price_panel(
        self,
        symbols: Iterable[str],
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        fields: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        """Return a multi-index DataFrame of prices for the provided symbols."""

        frames: List[pd.DataFrame] = []
        for sym in symbols:
            df_sym = self.get_quotes_df(sym, start_date=start_date, end_date=end_date, fields=fields)
            if not df_sym.empty:
                frames.append(df_sym)

        if not frames:
            selected_fields = list(dict.fromkeys(fields or [
                "open",
                "high",
                "low",
                "close",
                "adj_close",
                "volume",
            ]))
            empty = pd.DataFrame(columns=["date", "symbol"] + selected_fields)
            return empty.set_index(["date", "symbol"])

        combined = pd.concat(frames, ignore_index=True)
        combined["date"] = pd.to_datetime(combined["date"])
        combined["symbol"] = combined["symbol"].astype(str)
        combined = combined.set_index(["date", "symbol"]).sort_index()
        return combined


