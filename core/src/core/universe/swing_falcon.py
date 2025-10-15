from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from core.database import Company, MarketData, StockData


@dataclass
class SwingFalconUniverseSelector:
    """Construct a Swing Falcon stock universe based on DynamoDB fundamentals."""

    market_data: MarketData
    company: Company
    stock_data: Optional[StockData] = None
    price_start: Optional[date] = None
    price_end: Optional[date] = None
    market: str = "CN_A"
    asset_type: str = "stock"
    status: str = "active"
    limit: int = 100
    filters: Dict[str, Any] = field(default_factory=dict)
    _last_evaluation: List[Dict[str, Any]] = field(default_factory=list, init=False)
    _price_cache: Dict[str, float] = field(default_factory=dict, init=False)

    def select(self) -> List[str]:
        candidates = self._load_candidates()
        if not candidates:
            return []
        self._last_evaluation = []
        fundamentals = self.company.batch_get_companies(
            [row["symbol"] for row in candidates],
            attributes=[
                "market_cap",
                "pe_ttm",
                "eps_growth_ttm_yoy",
                "roe_ttm",
                "beta_5y",
                "dividend_yield_ttm",
                "revenue_growth_ttm_yoy",
                "inc_net_income",
                "inc_eps_basic",
                "bs_total_equity",
                "inc_revenue",
            ],
        )
        selected: List[str] = []
        for row in candidates:
            symbol = str(row.get("symbol", "")).strip().upper()
            if not symbol:
                continue
            fundamentals_row = fundamentals.get(symbol, {})
            passed, detail = self._evaluate_row(symbol, fundamentals_row)
            self._last_evaluation.append(detail)
            if passed:
                selected.append(symbol)
            if self.limit and len(selected) >= self.limit:
                break
        return selected

    def selection_summary(self, passed_only: bool = False) -> List[Dict[str, Any]]:
        if passed_only:
            return [row for row in self._last_evaluation if row.get("passed")]
        return list(self._last_evaluation)

    def _load_candidates(self) -> List[Dict[str, Any]]:
        projection = ["symbol", "market", "asset_type", "status"]
        items = self.market_data.scan_stock_catalog(
            asset_type=self.asset_type,
            market=self.market,
            status=self.status,
            limit=self.limit * 5 if self.limit else None,
            projection=projection,
        )
        seen = set()
        result: List[Dict[str, Any]] = []
        for item in items:
            symbol = str(item.get("symbol", "")).strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            result.append({"symbol": symbol})
        return result

    def _evaluate_row(self, symbol: str, row: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        # Default thresholds (can be overridden via filters)
        min_market_cap = float(self.filters.get("market_cap_min", 0.0))
        max_pe = float(self.filters.get("pe_max", 60.0))
        min_eps_growth = float(self.filters.get("eps_growth_min", 0.0))
        min_roe = float(self.filters.get("roe_min", 0.0))
        min_revenue_growth = float(self.filters.get("revenue_growth_min", 0.0))
        min_beta = self.filters.get("beta_min")
        max_beta = self.filters.get("beta_max")

        enriched = self._apply_fallback_metrics(symbol, row)

        def _value(name: str) -> Optional[float]:
            val = enriched.get(name)
            if val is None:
                return None
            try:
                return float(val)
            except Exception:  # noqa: BLE001
                return None

        market_cap = _value("market_cap")
        pe = _value("pe_ttm")
        eps_growth = _value("eps_growth_ttm_yoy")
        roe = _value("roe_ttm")
        revenue_growth = _value("revenue_growth_ttm_yoy")
        beta = _value("beta_5y")

        detail: Dict[str, Any] = {
            "symbol": symbol,
            "market_cap": market_cap,
            "pe_ttm": pe,
            "eps_growth_ttm_yoy": eps_growth,
            "roe_ttm": roe,
            "revenue_growth_ttm_yoy": revenue_growth,
            "beta_5y": beta,
        }

        checks = {
            "market_cap_pass": market_cap is None or market_cap >= min_market_cap,
            "pe_pass": pe is None or pe <= max_pe,
            "eps_growth_pass": eps_growth is None or eps_growth >= min_eps_growth,
            "roe_pass": roe is None or roe >= min_roe,
            "revenue_growth_pass": revenue_growth is None or revenue_growth >= min_revenue_growth,
            "beta_pass": (
                beta is None
                or ((min_beta is None or beta >= min_beta) and (max_beta is None or beta <= max_beta))
            ),
        }
        detail.update(checks)
        detail["passed"] = all(checks.values())
        return detail["passed"], detail

    def _apply_fallback_metrics(self, symbol: str, row: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(row)

        price = None
        if self.stock_data is not None:
            price = self._price_cache.get(symbol)
            if price is None:
                price = self._fetch_latest_price(symbol)
                if price is not None:
                    self._price_cache[symbol] = price

        def _to_float(val: Any) -> Optional[float]:
            if val is None:
                return None
            try:
                return float(val)
            except Exception:  # noqa: BLE001
                return None

        net_income = _to_float(enriched.get("inc_net_income"))
        eps_basic = _to_float(enriched.get("inc_eps_basic"))
        equity = _to_float(enriched.get("bs_total_equity"))

        market_cap = _to_float(enriched.get("market_cap"))
        if market_cap is None and price is not None and eps_basic and net_income:
            shares = net_income / eps_basic if eps_basic else None
            if shares and shares > 0:
                market_cap = price * shares
                enriched["market_cap"] = market_cap

        pe = _to_float(enriched.get("pe_ttm"))
        if pe is None and price is not None and eps_basic and eps_basic != 0:
            enriched["pe_ttm"] = price / eps_basic

        roe = _to_float(enriched.get("roe_ttm"))
        if roe is None and net_income is not None and equity:
            enriched["roe_ttm"] = net_income / equity if equity else None

        if enriched.get("eps_growth_ttm_yoy") is None:
            enriched["eps_growth_ttm_yoy"] = 0.0
        if enriched.get("revenue_growth_ttm_yoy") is None:
            enriched["revenue_growth_ttm_yoy"] = 0.0

        return enriched

    def _fetch_latest_price(self, symbol: str) -> Optional[float]:
        if self.stock_data is None:
            return None
        try:
            df = self.stock_data.get_quotes_df(symbol, start_date=self.price_start, end_date=self.price_end)
            if df is None or df.empty:
                df = self.stock_data.get_quotes_df(symbol)
            if df is None or df.empty:
                return None
            close_val = df.iloc[-1].get("close")
            if close_val is None:
                return None
            return float(close_val)
        except Exception:  # noqa: BLE001
            return None
