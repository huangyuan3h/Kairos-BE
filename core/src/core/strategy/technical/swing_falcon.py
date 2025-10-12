from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple
import math
import warnings

import pandas as pd

from core.backtest.strategy import Strategy, StrategyContext, StrategyError


@dataclass
class SwingFalconStrategy(Strategy):
    """Swing Falcon strategy approximating the TradingView red line system."""

    max_positions: int = 10
    min_market_cap: Optional[float] = 4_000_000_000.0
    max_pe: Optional[float] = 30.0
    min_eps_growth: Optional[float] = 0.0
    min_roe: Optional[float] = 0.0
    max_beta: Optional[float] = 2.0
    min_beta: Optional[float] = 0.5
    min_div_yield: Optional[float] = None
    min_avg_volume: Optional[float] = None

    ema_short_len: int = 21
    ema_mid_len: int = 55
    ema_long_len: int = 144
    rsi_len: int = 14
    atr_breakout_len: int = 14
    atr_trail_len: int = 10
    volume_lookback: int = 20

    rsi_buy_threshold: float = 55.0
    rsi_exit_threshold: float = 48.0
    buy_volume_factor: float = 1.1
    trail_atr_mult: float = 2.0
    breakout_atr_mult: float = 0.25

    universe_overrides: Optional[Sequence[str]] = None
    price_field: Optional[str] = None

    _eligible_symbols: List[str] = field(default_factory=list, init=False)
    _indicator_frames: Dict[str, pd.DataFrame] = field(default_factory=dict, init=False)
    _latest_indicators: Dict[str, Dict[str, float]] = field(default_factory=dict, init=False)

    def initialize(self, context: StrategyContext) -> None:
        """Pre-compute indicators and eligible symbols.

        The workflow mirrors the TradingView筛选器：先用基本面筛选，再在
        通过历史行情构造 EMA/RSI/ATR/成交量等指标，为日后 rebalance
        使用。计算结果缓存到 ``_indicator_frames``，回测时直接按日期
        取数即可，无需重复遍历原始 DataFrame。
        """
        if context.price_history.empty:
            raise StrategyError("Price history is required for SwingFalconStrategy")

        price_field = self.price_field or context.config.price_field
        fallback_field = context.config.fallback_price_field
        required_price_cols = {price_field, fallback_field, "high", "low", "volume"}
        missing_cols = required_price_cols - set(context.price_history.columns)
        if missing_cols:
            raise StrategyError(f"Price history is missing required columns: {sorted(missing_cols)}")

        fundamentals = context.fundamentals
        if fundamentals.empty:
            raise StrategyError("Fundamental data is required for SwingFalconStrategy")

        if fundamentals.index.name != "symbol":
            if "symbol" in fundamentals.columns:
                fundamentals = fundamentals.set_index("symbol")
            else:
                warnings.warn("Fundamental dataframe lacks 'symbol' index; strategy may skip all symbols.")
                fundamentals.index.name = "symbol"

        candidate_universe: Sequence[str]
        if self.universe_overrides:
            candidate_universe = list(dict.fromkeys(self.universe_overrides))
        else:
            candidate_universe = context.universe

        eligible: List[str] = []
        indicator_frames: Dict[str, pd.DataFrame] = {}
        for symbol in candidate_universe:
            if symbol not in fundamentals.index:
                continue
            row = fundamentals.loc[symbol]
            if not self._passes_fundamental_filters(row):
                continue
            price_df = self._prepare_symbol_frame(context.price_history, symbol)
            if price_df is None or price_df.empty:
                continue
            indicator_frames[symbol] = price_df
            eligible.append(symbol)

        if not eligible:
            warnings.warn("No symbols satisfy SwingFalconStrategy filters; strategy will stay in cash.")

        self._eligible_symbols = eligible
        self._indicator_frames = indicator_frames
        self._latest_indicators = {
            symbol: self._extract_latest_metrics(frame)
            for symbol, frame in indicator_frames.items()
            if not frame.empty
        }

    def on_rebalance(
        self,
        as_of: date,
        context: StrategyContext,
        price_snapshot: pd.DataFrame,
        portfolio,
    ) -> Dict[str, float]:
        """Return equal-weight allocations for symbols处于“多头趋势 + 红线未失效”状态。"""
        if not self._eligible_symbols:
            return {}

        active_symbols: List[str] = []
        scores: List[float] = []

        for symbol in self._eligible_symbols:
            frame = self._indicator_frames.get(symbol)
            if frame is None or frame.empty:
                continue
            ts = pd.Timestamp(as_of)
            if ts not in frame.index:
                continue
            row = frame.loc[ts]
            if bool(row.get("in_long", False)):
                active_symbols.append(symbol)
                scores.append(float(row.get("momentum", 0.0)))

        if not active_symbols:
            return {}

        # Rank by momentum score (higher preferred)
        ranked = [sym for _, sym in sorted(zip(scores, active_symbols), key=lambda pair: pair[0], reverse=True)]
        if self.max_positions > 0:
            ranked = ranked[: self.max_positions]

        weight = 1.0 / len(ranked)
        return {symbol: weight for symbol in ranked}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _passes_fundamental_filters(self, row: pd.Series) -> bool:
        def _value(name: str) -> Optional[float]:
            val = row.get(name)
            if pd.isna(val):
                return None
            try:
                return float(val)
            except Exception:  # noqa: BLE001
                return None

        market_cap = _value("market_cap")
        if self.min_market_cap is not None and (market_cap is None or market_cap < self.min_market_cap):
            return False

        pe = _value("pe_ttm")
        if self.max_pe is not None and (pe is None or pe > self.max_pe):
            return False

        eps_growth = _value("eps_growth_ttm_yoy")
        if self.min_eps_growth is not None and (eps_growth is None or eps_growth < self.min_eps_growth):
            return False

        roe = _value("roe_ttm")
        if self.min_roe is not None and (roe is None or roe < self.min_roe):
            return False

        beta = _value("beta_5y")
        if beta is not None:
            if self.min_beta is not None and beta < self.min_beta:
                return False
            if self.max_beta is not None and beta > self.max_beta:
                return False
        elif self.min_beta is not None or self.max_beta is not None:
            return False

        div_yield = _value("dividend_yield_ttm")
        if self.min_div_yield is not None and (div_yield is None or div_yield < self.min_div_yield):
            return False

        avg_volume = _value("avg_volume")
        if self.min_avg_volume is not None and (avg_volume is None or avg_volume < self.min_avg_volume):
            return False

        return True

    def latest_indicators(self) -> Dict[str, Dict[str, float]]:
        return dict(self._latest_indicators)

    @staticmethod
    def _extract_latest_metrics(frame: pd.DataFrame) -> Dict[str, float]:
        latest = frame.iloc[-1]
        return {
            "close": float(latest.get("close", 0.0)),
            "ema_short": float(latest.get("ema_short", 0.0)),
            "ema_mid": float(latest.get("ema_mid", 0.0)),
            "ema_long": float(latest.get("ema_long", 0.0)),
            "rsi": float(latest.get("rsi", 0.0)),
            "volume": float(latest.get("volume", 0.0)),
        }

    def _prepare_symbol_frame(self, price_history: pd.DataFrame, symbol: str) -> Optional[pd.DataFrame]:
        try:
            df = price_history.xs(symbol, level=1).copy()
        except KeyError:
            return None
        if df.empty:
            return None
        df = df.sort_index()
        df = df.rename(columns={self.price_field or "close": "px"})
        if "close" in df.columns:
            df["close"] = df["px"].fillna(df["close"])
        else:
            df["close"] = df["px"]
        df["close"] = df["close"].ffill()
        if df["close"].isna().all():
            return None

        # --- Indicator preparation (EMA/RSI/ATR/Volume etc.) -----------------
        df["ema_short"] = _ema(df["close"], self.ema_short_len)
        df["ema_mid"] = _ema(df["close"], self.ema_mid_len)
        df["ema_long"] = _ema(df["close"], self.ema_long_len)
        df["rsi"] = _rsi(df["close"], self.rsi_len)
        df["atr_breakout"] = _atr(df["high"], df["low"], df["close"], self.atr_breakout_len)
        df["atr_trail"] = _atr(df["high"], df["low"], df["close"], self.atr_trail_len)
        df["volume_sma"] = df["volume"].rolling(self.volume_lookback, min_periods=1).mean()
        df["momentum"] = df["close"].pct_change(self.ema_short_len).fillna(0.0)

        df["bull_structure"] = (
            (df["ema_short"] > df["ema_mid"]) & (df["ema_mid"] > df["ema_long"]) & (df["close"] > df["ema_mid"])
        )

        # --- Red line state machine (approximating the Pine script) -----------
        redline_values: List[float] = []
        in_long_flags: List[bool] = []
        entry_flags: List[bool] = []
        exit_flags: List[bool] = []

        in_long = False
        trail_high = None
        trail_level = math.nan

        for _, row in df.iterrows():
            entry = False
            exit_signal = False
            redline = math.nan

            atr_trail = row.get("atr_trail")
            atr_breakout = row.get("atr_breakout")
            ema_short = row.get("ema_short")
            ema_mid = row.get("ema_mid")
            rsi = row.get("rsi")
            volume = row.get("volume")
            volume_sma = row.get("volume_sma")
            high_price = row.get("high")
            close_price = row.get("close")

            if in_long:
                trail_high = high_price if trail_high is None else max(trail_high, high_price)
                if atr_trail and not math.isnan(atr_trail) and trail_high is not None:
                    candidate = trail_high - atr_trail * self.trail_atr_mult
                    if math.isnan(trail_level) or candidate > trail_level:
                        trail_level = candidate
                redline = trail_level
                exit_conditions = [
                    close_price < trail_level if not math.isnan(trail_level) else False,
                    rsi < self.rsi_exit_threshold if rsi is not None and not math.isnan(rsi) else False,
                ]
                if any(exit_conditions):
                    in_long = False
                    exit_signal = True
                    trail_high = None
                    trail_level = math.nan
                    redline = ema_short if (ema_short is not None and ema_mid is not None and ema_short < ema_mid) else math.nan
            if not in_long:
                bull = bool(row.get("bull_structure", False))
                volume_ok = (
                    volume is not None
                    and not math.isnan(volume)
                    and volume_sma is not None
                    and not math.isnan(volume_sma)
                    and volume >= volume_sma * self.buy_volume_factor
                )
                rsi_ok = rsi is not None and not math.isnan(rsi) and rsi >= self.rsi_buy_threshold
                close_ok = (
                    close_price is not None
                    and not math.isnan(close_price)
                    and ema_short is not None
                    and not math.isnan(ema_short)
                    and close_price >= ema_short
                )
                atr_ready = atr_breakout is not None and not math.isnan(atr_breakout)
                entry_cond = bull and volume_ok and rsi_ok and close_ok and atr_ready
                if entry_cond:
                    in_long = True
                    entry = True
                    trail_high = high_price
                    if atr_trail is not None and not math.isnan(atr_trail):
                        trail_level = high_price - atr_trail * self.trail_atr_mult
                    else:
                        trail_level = close_price - atr_breakout * self.trail_atr_mult if atr_breakout else close_price
                    redline = trail_level
                else:
                    redline = ema_short if (ema_short is not None and ema_mid is not None and ema_short < ema_mid) else math.nan

            in_long_flags.append(in_long)
            entry_flags.append(entry)
            exit_flags.append(exit_signal)
            redline_values.append(redline)

        df["redline"] = pd.Series(redline_values, index=df.index)
        df["in_long"] = pd.Series(in_long_flags, index=df.index)
        df["entry_signal"] = pd.Series(entry_flags, index=df.index)
        df["exit_signal"] = pd.Series(exit_flags, index=df.index)
        return df


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=1).mean()


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, length: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=length, adjust=False, min_periods=1).mean()


def _rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0.0)
    down = -delta.clip(upper=0.0)
    gain = up.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    loss = down.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    rsi.fillna(50.0, inplace=True)
    return rsi
