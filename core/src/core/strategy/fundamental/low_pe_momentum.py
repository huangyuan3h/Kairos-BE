from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple

import pandas as pd

from core.backtest.strategy import Strategy, StrategyContext, StrategyError


@dataclass
class LowPEMomentumStrategy(Strategy):
    """Low-PE universe filtered with simple momentum ranking."""

    max_assets: int = 20
    max_pe: Optional[float] = 40.0
    min_eps: float = 0.05
    momentum_window: int = 60
    min_momentum: float = 0.0
    price_field: Optional[str] = None
    universe_overrides: Optional[Sequence[str]] = None

    _eligible_symbols: List[str] = field(default_factory=list, init=False)
    _price_matrix: Optional[pd.DataFrame] = field(default=None, init=False)
    _price_field: Optional[str] = field(default=None, init=False)

    def initialize(self, context: StrategyContext) -> None:
        if self.momentum_window <= 0:
            raise StrategyError("momentum_window must be a positive integer")
        if context.fundamentals.empty:
            raise StrategyError("Fundamental data is required for LowPEMomentumStrategy")
        if "inc_eps_basic" not in context.fundamentals.columns:
            raise StrategyError("Fundamental data must include 'inc_eps_basic'")

        price_field = self.price_field or context.config.price_field
        if price_field not in context.price_history.columns:
            fallback = context.config.fallback_price_field
            if fallback not in context.price_history.columns:
                raise StrategyError("Required price fields are missing for price history")
            price_field = fallback
        self._price_field = price_field

        price_matrix = context.price_matrix(price_field)
        self._price_matrix = price_matrix

        fundamentals = context.fundamentals
        if fundamentals.index.name != "symbol":
            fundamentals = fundamentals.copy()
            if "symbol" in fundamentals.columns:
                fundamentals.set_index("symbol", inplace=True)
        fundamentals = fundamentals.sort_index()

        candidate_universe: Sequence[str]
        if self.universe_overrides is not None and len(self.universe_overrides) > 0:
            candidate_universe = list(dict.fromkeys(self.universe_overrides))
        else:
            candidate_universe = context.universe

        first_prices = price_matrix.apply(_first_valid_price)
        eligible: List[str] = []
        for symbol in candidate_universe:
            if symbol not in fundamentals.index:
                continue
            eps = fundamentals.at[symbol, "inc_eps_basic"]
            if pd.isna(eps) or eps <= self.min_eps:
                continue
            price = first_prices.get(symbol)
            if price is None or pd.isna(price) or price <= 0:
                continue
            pe = price / eps
            if self.max_pe is not None and pe > self.max_pe:
                continue
            eligible.append(symbol)

        self._eligible_symbols = sorted(dict.fromkeys(eligible))

    def on_rebalance(
        self,
        as_of: date,
        context: StrategyContext,
        price_snapshot: pd.DataFrame,
        portfolio,
    ) -> Dict[str, float]:
        if not self._eligible_symbols or self._price_matrix is None or self._price_field is None:
            return {}

        matrix = self._price_matrix
        ts = pd.Timestamp(as_of)
        history_slice = matrix.loc[:ts]
        if history_slice.empty:
            return {}
        window = history_slice.tail(self.momentum_window + 1)
        available_symbols = set(price_snapshot.index)

        scores: List[Tuple[str, float]] = []
        for symbol in self._eligible_symbols:
            if symbol not in window.columns or symbol not in available_symbols:
                continue
            series = window[symbol].dropna()
            if len(series) <= 1 or len(series) < self.momentum_window + 1:
                continue
            momentum = series.iloc[-1] / series.iloc[0] - 1.0
            if momentum < self.min_momentum:
                continue
            scores.append((symbol, float(momentum)))

        if not scores:
            return {}

        scores.sort(key=lambda item: item[1], reverse=True)
        limit = min(self.max_assets, context.config.max_positions)
        selected = [symbol for symbol, _ in scores[:limit] if symbol in available_symbols]
        if not selected:
            return {}

        weight = 1.0 / len(selected)
        return {symbol: weight for symbol in selected}


def _first_valid_price(series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return float("nan")
    return float(non_null.iloc[0])
