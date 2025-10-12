from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
import math

import numpy as np
import pandas as pd

from .strategy import Strategy, StrategyContext
from .data_provider import PriceDataProvider, FundamentalDataProvider, UniverseProvider


class BacktestError(Exception):
    """Exception raised when backtest configuration or data is invalid."""


@dataclass
class BacktestConfig:
    """Configuration bundle for a single backtest run."""

    start_date: date
    end_date: date
    initial_capital: float = 1_000_000.0
    rebalance_frequency: str = "weekly"
    max_positions: int = 100
    slippage_bps: float = 0.0
    transaction_cost_bps: float = 0.0
    price_field: str = "adj_close"
    fallback_price_field: str = "close"
    min_weight: float = 0.0
    price_fields: Optional[Sequence[str]] = None
    fundamental_fields: Optional[Sequence[str]] = None

    def validate(self) -> None:
        if self.start_date > self.end_date:
            raise BacktestError("start_date must be on or before end_date")
        if self.initial_capital <= 0:
            raise BacktestError("initial_capital must be positive")
        if self.max_positions <= 0:
            raise BacktestError("max_positions must be positive")
        if self.slippage_bps < 0 or self.transaction_cost_bps < 0:
            raise BacktestError("cost parameters cannot be negative")
        if not self.rebalance_frequency:
            raise BacktestError("rebalance_frequency must be provided")


@dataclass
class Position:
    """Mutable representation of an open position."""

    symbol: str
    quantity: float
    avg_price: float
    entry_date: date


@dataclass
class PositionView:
    """Immutable snapshot exposed to strategies and results."""

    symbol: str
    quantity: float
    avg_price: float
    market_price: float
    market_value: float


@dataclass
class TradeRecord:
    """Closed trade summary used for analytics."""

    symbol: str
    entry_date: date
    exit_date: date
    quantity: float
    entry_price: float
    exit_price: float
    profit: float
    return_pct: float


@dataclass
class PortfolioSnapshot:
    """Snapshot of portfolio state passed to strategies."""

    date: date
    cash: float
    equity: float
    positions: Sequence[PositionView]


@dataclass
class BacktestResult:
    """Aggregated outcome of a backtest run."""

    config: BacktestConfig
    equity_curve: pd.Series
    daily_returns: pd.Series
    total_return: float
    annualized_return: float
    max_drawdown: float
    volatility: float
    sharpe_ratio: float
    win_rate: float
    num_trades: int
    gross_profit: float
    gross_loss: float
    trades: List[TradeRecord]
    daily_turnover: pd.Series
    ending_positions: Dict[str, PositionView]
    ending_cash: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "config": self.config,
            "total_return": self.total_return,
            "annualized_return": self.annualized_return,
            "max_drawdown": self.max_drawdown,
            "volatility": self.volatility,
            "sharpe_ratio": self.sharpe_ratio,
            "win_rate": self.win_rate,
            "num_trades": self.num_trades,
            "gross_profit": self.gross_profit,
            "gross_loss": self.gross_loss,
            "ending_cash": self.ending_cash,
            "ending_positions": {
                symbol: {
                    "quantity": view.quantity,
                    "avg_price": view.avg_price,
                    "market_price": view.market_price,
                    "market_value": view.market_value,
                }
                for symbol, view in self.ending_positions.items()
            },
        }


class Portfolio:
    """Portfolio state container with basic execution logic."""

    def __init__(self, config: BacktestConfig) -> None:
        self._config = config
        self.cash: float = config.initial_capital
        self.positions: Dict[str, Position] = {}
        self.total_value: float = config.initial_capital
        self._last_price_map: Dict[str, float] = {}

    @property
    def slippage_factor(self) -> float:
        return self._config.slippage_bps / 10_000.0

    @property
    def fee_factor(self) -> float:
        return self._config.transaction_cost_bps / 10_000.0

    def mark_to_market(self, price_snapshot: pd.DataFrame) -> Dict[str, float]:
        price_map: Dict[str, float] = {}
        positions_value = 0.0
        for symbol, position in list(self.positions.items()):
            price = _resolve_price(symbol, price_snapshot, self._config)
            if price is None:
                price = self._last_price_map.get(symbol)
            if price is None:
                continue
            price_map[symbol] = price
            positions_value += position.quantity * price
        self._last_price_map = price_map
        self.total_value = self.cash + positions_value
        return price_map

    def snapshot(self, price_snapshot: pd.DataFrame, current_date: date) -> PortfolioSnapshot:
        views: List[PositionView] = []
        for symbol, position in self.positions.items():
            market_price = self._last_price_map.get(symbol)
            market_value = position.quantity * market_price if market_price is not None else 0.0
            views.append(
                PositionView(
                    symbol=symbol,
                    quantity=position.quantity,
                    avg_price=position.avg_price,
                    market_price=market_price or 0.0,
                    market_value=market_value,
                )
            )
        return PortfolioSnapshot(date=current_date, cash=self.cash, equity=self.total_value, positions=views)

    def positions_summary(self) -> Dict[str, PositionView]:
        summary: Dict[str, PositionView] = {}
        for symbol, position in self.positions.items():
            market_price = self._last_price_map.get(symbol, 0.0)
            market_value = position.quantity * market_price
            summary[symbol] = PositionView(
                symbol=symbol,
                quantity=position.quantity,
                avg_price=position.avg_price,
                market_price=market_price,
                market_value=market_value,
            )
        return summary

    def rebalance(
        self,
        target_weights: Dict[str, float],
        price_snapshot: pd.DataFrame,
        current_date: date,
    ) -> Tuple[List[TradeRecord], float]:
        trades: List[TradeRecord] = []
        pre_trade_equity = self.total_value
        if pre_trade_equity <= 0:
            return trades, 0.0

        normalized_weights = _prepare_weights(target_weights, self.positions.keys(), self._config.max_positions)
        weight_sum = sum(max(w, 0.0) for w in normalized_weights.values())
        if weight_sum > 1.0:
            scale = 1.0 / weight_sum
            for symbol in normalized_weights:
                normalized_weights[symbol] = max(normalized_weights[symbol], 0.0) * scale

        slippage = self.slippage_factor
        fee_factor = self.fee_factor
        eps = 1e-8

        sell_orders: List[Tuple[str, float, float]] = []
        buy_orders: List[Tuple[str, float, float]] = []
        all_symbols = set(normalized_weights.keys()) | set(self.positions.keys())

        for symbol in all_symbols:
            target_weight = normalized_weights.get(symbol, 0.0)
            price = _resolve_price(symbol, price_snapshot, self._config)
            if price is None or price <= 0:
                continue
            position = self.positions.get(symbol)
            current_qty = position.quantity if position else 0.0
            desired_value = target_weight * pre_trade_equity
            desired_qty = desired_value / price if price > 0 else 0.0
            delta_qty = desired_qty - current_qty
            if delta_qty < -eps:
                sell_orders.append((symbol, abs(delta_qty), price))
            elif delta_qty > eps:
                buy_orders.append((symbol, delta_qty, price))

        turnover_value = 0.0

        # Execute sells first to free cash
        for symbol, qty, price in sell_orders:
            position = self.positions.get(symbol)
            if position is None or qty <= eps:
                continue
            qty = min(qty, position.quantity)
            effective_price = price * (1.0 - slippage)
            gross_proceeds = qty * effective_price
            transaction_cost = qty * price * fee_factor
            cash_received = gross_proceeds - transaction_cost
            cost_basis = qty * position.avg_price
            profit = cash_received - cost_basis
            return_pct = profit / cost_basis if cost_basis > 0 else 0.0
            self.cash += cash_received
            position.quantity -= qty
            if position.quantity <= eps:
                del self.positions[symbol]
            trades.append(
                TradeRecord(
                    symbol=symbol,
                    entry_date=position.entry_date,
                    exit_date=current_date,
                    quantity=qty,
                    entry_price=position.avg_price,
                    exit_price=price,
                    profit=profit,
                    return_pct=return_pct,
                )
            )
            turnover_value += qty * price

        # Estimate total cash needed for buys
        estimated_cash_needed = 0.0
        for symbol, qty, price in buy_orders:
            effective_price = price * (1.0 + slippage)
            transaction_cost = qty * price * fee_factor
            estimated_cash_needed += qty * effective_price + transaction_cost

        if estimated_cash_needed > self.cash and estimated_cash_needed > 0:
            scale = self.cash / estimated_cash_needed
            buy_orders = [(symbol, qty * scale, price) for symbol, qty, price in buy_orders]

        for symbol, qty, price in buy_orders:
            if qty <= eps:
                continue
            effective_price = price * (1.0 + slippage)
            transaction_cost = qty * price * fee_factor
            cash_required = qty * effective_price + transaction_cost
            if cash_required > self.cash + 1e-6:
                continue
            position = self.positions.get(symbol)
            if position is None:
                position = Position(symbol=symbol, quantity=0.0, avg_price=0.0, entry_date=current_date)
                self.positions[symbol] = position
            total_cost = position.quantity * position.avg_price + cash_required
            position.quantity += qty
            if position.quantity > eps:
                position.avg_price = total_cost / position.quantity
                if position.quantity - qty <= eps:
                    position.entry_date = current_date
            self.cash -= cash_required
            turnover_value += qty * price

        return trades, turnover_value / pre_trade_equity if pre_trade_equity > 0 else 0.0


class BacktestEngine:
    """Run event-driven backtests over daily bar data."""

    def __init__(
        self,
        config: BacktestConfig,
        price_provider: PriceDataProvider,
        fundamental_provider: Optional[FundamentalDataProvider] = None,
        universe_provider: Optional[UniverseProvider] = None,
    ) -> None:
        config.validate()
        self._config = config
        self._price_provider = price_provider
        self._fundamental_provider = fundamental_provider
        self._universe_provider = universe_provider

    def run(
        self,
        strategy: Strategy,
        universe: Optional[Sequence[str]] = None,
        fundamentals_override: Optional[pd.DataFrame] = None,
        price_history_override: Optional[pd.DataFrame] = None,
    ) -> BacktestResult:
        """Execute a backtest for the supplied strategy.

        Steps:
          1. Resolve the tradable universe (explicit list or provider callback).
          2. Load price history and fundamentals via the configured providers.
          3. Invoke ``strategy.initialize`` with the populated context.
          4. Iterate over each trading day, triggering rebalances on the requested
             schedule and marking the portfolio to market.
          5. Assemble an immutable :class:`BacktestResult` summarising performance.
        """
        resolved_universe = self._resolve_universe(universe)
        if not resolved_universe:
            raise BacktestError("Universe is empty. Provide symbols or a universe provider.")

        price_history = self._load_price_history(resolved_universe, price_history_override)
        if price_history.index.nlevels != 2:
            raise BacktestError("Price history must be indexed by (date, symbol).")

        date_level_name = price_history.index.names[0] or "date"

        start_ts = pd.Timestamp(self._config.start_date)
        end_ts = pd.Timestamp(self._config.end_date)
        price_history = price_history.loc[(slice(start_ts, end_ts), slice(None)), :]
        if price_history.empty:
            raise BacktestError("No price data found within the requested window.")

        if (
            self._config.price_field not in price_history.columns
            and self._config.fallback_price_field not in price_history.columns
        ):
            raise BacktestError("Requested price fields are not present in price history.")

        date_index = price_history.index.get_level_values(date_level_name).unique()

        fundamentals_df = self._load_fundamentals(
            resolved_universe,
            fundamentals_override=fundamentals_override,
        )

        context = StrategyContext(
            price_history=price_history,
            fundamentals=fundamentals_df,
            config=self._config,
            universe=resolved_universe,
        )
        strategy.initialize(context)

        portfolio = Portfolio(self._config)
        rebalance_set = set(self._compute_rebalance_dates(date_index, self._config.rebalance_frequency))

        equity_curve: List[Tuple[date, float]] = []
        turnover_series: List[Tuple[date, float]] = []
        trades: List[TradeRecord] = []

        for ts in date_index:
            current_date = ts.date()
            snapshot = price_history.xs(ts, level=date_level_name)
            portfolio.mark_to_market(snapshot)
            context.current_date = current_date
            if ts in rebalance_set:
                # Ask the strategy for target weights and reconcile with current holdings.
                snapshot_view = portfolio.snapshot(snapshot, current_date)
                target_weights = strategy.on_rebalance(current_date, context, snapshot, snapshot_view)
                closed_trades, turnover = portfolio.rebalance(target_weights, snapshot, current_date)
                if turnover > 0:
                    turnover_series.append((current_date, turnover))
                trades.extend(closed_trades)
                portfolio.mark_to_market(snapshot)
            equity_curve.append((current_date, portfolio.total_value))

        daily_turnover_series = _series_from_pairs(turnover_series)
        equity_series = _series_from_pairs(equity_curve, fill_forward=True)
        daily_returns = equity_series.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0)

        total_return = (equity_series.iloc[-1] / equity_series.iloc[0]) - 1.0 if len(equity_series) > 1 else 0.0
        periods = len(equity_series)
        annualized_return = (
            (equity_series.iloc[-1] / equity_series.iloc[0]) ** (252.0 / periods) - 1.0
            if periods > 1 and equity_series.iloc[0] > 0
            else 0.0
        )
        rolling_max = equity_series.cummax()
        drawdowns = equity_series / rolling_max - 1.0
        max_drawdown = float(drawdowns.min()) if not drawdowns.empty else 0.0
        volatility = float(daily_returns.std(ddof=0) * math.sqrt(252))
        sharpe_ratio = 0.0
        if volatility > 0:
            sharpe_ratio = float(daily_returns.mean() / daily_returns.std(ddof=0) * math.sqrt(252))

        wins = sum(1 for t in trades if t.profit > 0)
        losses = sum(1 for t in trades if t.profit < 0)
        win_rate = wins / (wins + losses) if (wins + losses) > 0 else 0.0
        gross_profit = sum(t.profit for t in trades if t.profit > 0)
        gross_loss = sum(t.profit for t in trades if t.profit < 0)

        ending_positions = portfolio.positions_summary()

        return BacktestResult(
            config=self._config,
            equity_curve=equity_series,
            daily_returns=daily_returns,
            total_return=float(total_return),
            annualized_return=float(annualized_return),
            max_drawdown=float(max_drawdown),
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            win_rate=float(win_rate),
            num_trades=len(trades),
            gross_profit=float(gross_profit),
            gross_loss=float(gross_loss),
            trades=trades,
            daily_turnover=daily_turnover_series,
            ending_positions=ending_positions,
            ending_cash=portfolio.cash,
        )

    def _resolve_universe(self, universe: Optional[Sequence[str]]) -> List[str]:
        if universe is not None:
            cleaned = [str(sym).strip().upper() for sym in universe if str(sym).strip()]
            return list(dict.fromkeys(cleaned))
        if self._universe_provider is None:
            return []
        provided = self._universe_provider(self._config)
        cleaned = [str(sym).strip().upper() for sym in provided if str(sym).strip()]
        return list(dict.fromkeys(cleaned))

    def _load_price_history(
        self,
        universe: Sequence[str],
        price_history_override: Optional[pd.DataFrame] = None,
    ) -> pd.DataFrame:
        if price_history_override is not None:
            return price_history_override.sort_index()

        fields = self._config.price_fields
        if fields is None:
            fields = [
                self._config.price_field,
                self._config.fallback_price_field,
                "open",
                "high",
                "low",
                "volume",
            ]
        fields = list(dict.fromkeys(f for f in fields if f))
        panel = self._price_provider.load(
            symbols=universe,
            start_date=self._config.start_date,
            end_date=self._config.end_date,
            fields=fields,
        )
        if panel is None or panel.empty:
            raise BacktestError("Price provider returned no data")
        panel = panel.sort_index()
        return panel

    def _load_fundamentals(
        self,
        universe: Sequence[str],
        fundamentals_override: Optional[pd.DataFrame] = None,
    ) -> pd.DataFrame:
        if fundamentals_override is not None:
            return self._normalize_fundamentals(fundamentals_override)
        if self._fundamental_provider is None:
            return pd.DataFrame()
        attributes = list(dict.fromkeys(self._config.fundamental_fields or [])) or None
        df = self._fundamental_provider.load(universe, attributes=attributes)
        return self._normalize_fundamentals(df)

    @staticmethod
    def _normalize_fundamentals(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()
        result = df.copy()
        if "symbol" in result.columns:
            result = result.set_index("symbol")
        elif result.index.name != "symbol":
            result.index.name = "symbol"
        return result

    def _compute_rebalance_dates(
        self,
        dates: pd.Index,
        frequency: str,
    ) -> Sequence[pd.Timestamp]:
        freq = frequency.lower()
        if freq == "daily":
            return list(dates)
        idx = pd.Index(dates)
        if freq == "weekly":
            anchors = pd.Series(1, index=idx).resample("W-FRI").last().dropna().index
        elif freq == "monthly":
            anchors = pd.Series(1, index=idx).resample("M").last().dropna().index
        elif freq.endswith("d") and freq[:-1].isdigit():
            step = int(freq[:-1])
            anchors = idx[:: max(step, 1)]
        else:
            raise BacktestError(f"Unsupported rebalance frequency: {frequency}")

        mapped: List[pd.Timestamp] = []
        for anchor in anchors:
            eligible = idx[idx <= anchor]
            if eligible.empty:
                eligible = idx[:1]
            mapped.append(pd.Timestamp(eligible[-1]))
        return list(dict.fromkeys(mapped))


def _resolve_price(symbol: str, price_snapshot: pd.DataFrame, config: BacktestConfig) -> Optional[float]:
    if symbol not in price_snapshot.index:
        return None
    row = price_snapshot.loc[symbol]
    if isinstance(row, pd.Series):
        price = row.get(config.price_field)
        if price is None or pd.isna(price):
            price = row.get(config.fallback_price_field)
    else:
        price = row
    if price is None or pd.isna(price):
        return None
    price_float = float(price)
    return price_float if price_float > 0 else None


def _prepare_weights(
    target_weights: Dict[str, float],
    existing_symbols: Iterable[str],
    max_positions: int,
) -> Dict[str, float]:
    weights = {symbol: max(weight, 0.0) for symbol, weight in target_weights.items() if weight is not None}
    positive = sorted(weights.items(), key=lambda item: item[1], reverse=True)
    trimmed = dict(positive[:max_positions])
    for symbol in existing_symbols:
        if symbol not in trimmed:
            trimmed[symbol] = 0.0
    return trimmed


def _series_from_pairs(pairs: Sequence[Tuple[date, float]], fill_forward: bool = False) -> pd.Series:
    if not pairs:
        return pd.Series(dtype=float)
    dates, values = zip(*pairs)
    series = pd.Series(values, index=pd.DatetimeIndex(dates, name="date"))
    if fill_forward:
        series = series.ffill()
    return series
