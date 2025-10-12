from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional, Protocol, Sequence, TYPE_CHECKING

import pandas as pd

from core.database import Company, StockData

if TYPE_CHECKING:  # pragma: no cover
    from .engine import BacktestConfig


class PriceDataProvider(Protocol):
    """Abstraction for loading price history matrices."""

    def load(
        self,
        symbols: Sequence[str],
        start_date: date,
        end_date: date,
        fields: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        """Return a MultiIndex DataFrame indexed by (date, symbol)."""


class FundamentalDataProvider(Protocol):
    """Abstraction for loading company-level fundamentals."""

    def load(
        self,
        symbols: Sequence[str],
        attributes: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        """Return a DataFrame indexed by symbol containing requested attributes."""


class UniverseProvider(Protocol):
    """Abstraction that returns the tradable universe for a backtest."""

    def __call__(self, config: "BacktestConfig") -> Sequence[str]:
        ...


@dataclass
class DynamoPriceDataProvider:
    """Price provider backed by the StockData DynamoDB table."""

    stock_data: StockData

    def load(
        self,
        symbols: Sequence[str],
        start_date: date,
        end_date: date,
        fields: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        if not symbols:
            return pd.DataFrame()
        panel = self.stock_data.get_price_panel(
            symbols=symbols,
            start_date=start_date,
            end_date=end_date,
            fields=fields,
        )
        return panel


@dataclass
class DynamoFundamentalDataProvider:
    """Fundamental provider backed by the Company DynamoDB table."""

    company: Company

    def load(
        self,
        symbols: Sequence[str],
        attributes: Optional[Sequence[str]] = None,
    ) -> pd.DataFrame:
        if not symbols:
            return pd.DataFrame()
        records = self.company.batch_get_companies(symbols, attributes=attributes)
        if not records:
            return pd.DataFrame()
        df = pd.DataFrame.from_dict(records, orient="index")
        if "pk" in df.columns:
            df.rename(columns={"pk": "symbol"}, inplace=True)
        if "symbol" not in df.columns:
            df["symbol"] = df.index
        df.index = df["symbol"].astype(str)
        return df
