from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, Sequence

import pandas as pd
import pytest

from core.backtest.engine import BacktestConfig, BacktestEngine
from core.backtest.strategy import StrategyError
from core.strategy import SwingFalconStrategy


def _build_price_history(data: Dict[str, list]) -> pd.DataFrame:
    records = []
    dates = pd.date_range("2023-01-02", periods=len(next(iter(data.values()))), freq="B")
    for symbol, prices in data.items():
        for dt, price in zip(dates, prices):
            records.append(
                {
                    "date": dt,
                    "symbol": symbol,
                    "close": price,
                    "adj_close": price,
                    "high": price * 1.01,
                    "low": price * 0.99,
                    "volume": 1_000_000.0,
                }
            )
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index(["date", "symbol"]).sort_index()


class StaticPriceProvider:
    def __init__(self, frame: pd.DataFrame) -> None:
        self._frame = frame.sort_index()

    def load(
        self,
        symbols: Sequence[str],
        start_date: date,
        end_date: date,
        fields: Sequence[str] | None = None,
    ) -> pd.DataFrame:
        df = self._frame.copy()
        idx = pd.IndexSlice
        window = df.loc[idx[pd.Timestamp(start_date) : pd.Timestamp(end_date), :], :]
        result = window[window.index.get_level_values("symbol").isin(set(symbols))].copy()
        if fields:
            keep = [field for field in fields if field in result.columns]
            if keep:
                result = result[keep]
        return result


class StaticFundamentalProvider:
    def __init__(self, frame: pd.DataFrame) -> None:
        self._frame = frame.copy()

    def load(self, symbols: Sequence[str], attributes: Sequence[str] | None = None) -> pd.DataFrame:
        df = self._frame[self._frame["symbol"].isin(set(symbols))].copy()
        if attributes:
            keep = ["symbol"] + [attr for attr in attributes if attr in df.columns]
            df = df[keep]
        return df


def _default_universe(frame: pd.DataFrame) -> Sequence[str]:
    return frame.index.get_level_values("symbol").unique().tolist()


@dataclass
class BuyAndHoldStrategy:
    symbol: str

    def initialize(self, context) -> None:
        if self.symbol not in context.universe:
            raise StrategyError(f"Symbol {self.symbol} not found in universe")

    def on_rebalance(self, as_of, context, price_snapshot, portfolio):
        return {self.symbol: 1.0}


@dataclass
class EqualWeightStrategy:
    def initialize(self, context) -> None:
        self.symbols = sorted(context.universe)

    def on_rebalance(self, as_of, context, price_snapshot, portfolio):
        if not self.symbols:
            return {}
        weight = 1.0 / len(self.symbols)
        return {symbol: weight for symbol in self.symbols}


def test_backtest_engine_buy_and_hold_generates_expected_return():
    price_history = _build_price_history({"AAA": [10.0, 11.0, 12.5, 14.0, 15.0]})
    fundamentals = pd.DataFrame({"symbol": ["AAA"], "inc_eps_basic": [2.0]})
    config = BacktestConfig(
        start_date=date(2023, 1, 2),
        end_date=date(2023, 1, 9),
        initial_capital=100_000.0,
        rebalance_frequency="daily",
        price_field="close",
        fallback_price_field="close",
        slippage_bps=0.0,
        transaction_cost_bps=0.0,
    )
    engine = BacktestEngine(
        config,
        price_provider=StaticPriceProvider(price_history),
        fundamental_provider=StaticFundamentalProvider(fundamentals),
    )
    strategy = BuyAndHoldStrategy(symbol="AAA")
    result = engine.run(strategy, universe=["AAA"])
    assert pytest.approx(result.total_return, rel=1e-6) == 0.5
    assert result.num_trades == 0
    assert pytest.approx(result.equity_curve.iloc[-1], rel=1e-6) == 150_000.0


def test_engine_respects_max_position_constraint():
    price_history = _build_price_history(
        {
            "AAA": [10, 11, 12, 13],
            "BBB": [20, 21, 22, 23],
            "CCC": [30, 31, 32, 33],
            "DDD": [40, 41, 42, 43],
            "EEE": [50, 51, 52, 53],
        }
    )
    fundamentals = pd.DataFrame({"symbol": list(price_history.index.get_level_values("symbol").unique()), "inc_eps_basic": [1.0] * 5})
    config = BacktestConfig(
        start_date=date(2023, 1, 2),
        end_date=date(2023, 1, 9),
        initial_capital=100_000.0,
        rebalance_frequency="daily",
        price_field="close",
        fallback_price_field="close",
        max_positions=3,
        slippage_bps=0.0,
        transaction_cost_bps=0.0,
    )
    engine = BacktestEngine(
        config,
        price_provider=StaticPriceProvider(price_history),
        fundamental_provider=StaticFundamentalProvider(fundamentals),
    )
    strategy = EqualWeightStrategy()
    result = engine.run(strategy, universe=_default_universe(price_history))
    assert len(result.ending_positions) <= 3


def test_swing_falcon_strategy_generates_allocation():
    price_history = _build_price_history({"AAA": [50 + i * 0.8 for i in range(120)]})
    fundamentals = pd.DataFrame(
        {
            "symbol": ["AAA"],
            "inc_eps_basic": [2.0],
            "market_cap": [8_000_000_000.0],
            "pe_ttm": [18.0],
            "eps_growth_ttm_yoy": [0.25],
            "roe_ttm": [0.22],
            "beta_5y": [1.2],
            "avg_volume": [1_500_000.0],
        }
    )
    config = BacktestConfig(
        start_date=date(2023, 1, 2),
        end_date=date(2023, 6, 30),
        initial_capital=100_000.0,
        rebalance_frequency="daily",
        price_field="close",
        fallback_price_field="close",
        slippage_bps=0.0,
        transaction_cost_bps=0.0,
        max_positions=3,
    )
    engine = BacktestEngine(
        config,
        price_provider=StaticPriceProvider(price_history),
        fundamental_provider=StaticFundamentalProvider(fundamentals),
    )
    strategy = SwingFalconStrategy(
        max_positions=3,
        min_market_cap=1_000_000.0,
        max_pe=30.0,
        min_eps_growth=0.05,
        min_roe=0.1,
        min_beta=0.5,
        max_beta=1.5,
        price_field="close",
        buy_volume_factor=1.0,
        rsi_buy_threshold=50.0,
    )
    result = engine.run(strategy, universe=["AAA"])
    assert "AAA" in result.ending_positions
    assert result.ending_positions["AAA"].quantity > 0
