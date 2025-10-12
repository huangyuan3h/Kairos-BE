from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Optional, Protocol, Sequence, TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:  # pragma: no cover
    from .engine import BacktestConfig, PortfolioSnapshot


class StrategyError(Exception):
    """Raised when a strategy cannot operate with the supplied context."""


@dataclass
class StrategyContext:
    """Shared view of data and configuration for strategy implementations.

    The context is created by :class:`BacktestEngine` prior to calling
    :meth:`Strategy.initialize`. Strategies can read price history, fundamentals
    and configuration values from this structure but should not mutate them.
    """

    price_history: pd.DataFrame
    fundamentals: pd.DataFrame
    config: "BacktestConfig"
    universe: Sequence[str]
    current_date: Optional[date] = None

    def price_matrix(self, field: str) -> pd.DataFrame:
        """Return a pivoted price matrix with dates as index and symbols as columns."""
        if field not in self.price_history.columns:
            raise StrategyError(f"Field '{field}' not present in price history")
        matrix = self.price_history[[field]].unstack(level=1)[field].sort_index()
        return matrix


class Strategy(Protocol):
    """Contract that all backtest strategies must follow."""

    def initialize(self, context: StrategyContext) -> None:
        ...

    def on_rebalance(
        self,
        as_of: date,
        context: StrategyContext,
        price_snapshot: pd.DataFrame,
        portfolio: "PortfolioSnapshot",
    ) -> Dict[str, float]:
        ...
