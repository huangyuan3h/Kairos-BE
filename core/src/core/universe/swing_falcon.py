from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.database import Company, MarketData


@dataclass
class SwingFalconUniverseSelector:
    """Construct a Swing Falcon stock universe based on DynamoDB fundamentals."""

    market_data: MarketData
    company: Company
    market: str = "CN_A"
    asset_type: str = "stock"
    status: str = "active"
    limit: int = 100
    filters: Dict[str, Any] = field(default_factory=dict)
    _last_evaluation: List[Dict[str, Any]] = field(default_factory=list, init=False)

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
            ],
        )
        selected: List[str] = []
        for row in candidates:
            symbol = str(row.get("symbol", "")).strip().upper()
            if not symbol:
                continue
            fundamentals_row = fundamentals.get(symbol)
            if not fundamentals_row:
                continue
            passed, detail = self._evaluate_row(symbol, fundamentals_row)
            self._last_evaluation.append(detail)
            if passed:
                selected.append(symbol)
            if self.limit and len(selected) >= self.limit:
                break
        return selected

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

    def selection_summary(self, passed_only: bool = False) -> List[Dict[str, Any]]:
        if passed_only:
            return [row for row in self._last_evaluation if row.get("passed")]
        return list(self._last_evaluation)

    def _evaluate_row(self, symbol: str, row: Dict[str, Any]) -> Tuple[bool, Dict[str, Any]]:
        min_market_cap = float(self.filters.get("market_cap_min", 4_000_000_000))
        max_pe = float(self.filters.get("pe_max", 30.0))
        min_eps_growth = float(self.filters.get("eps_growth_min", 0.10))
        min_roe = float(self.filters.get("roe_min", 0.15))
        min_revenue_growth = float(self.filters.get("revenue_growth_min", 0.10))
        min_beta = float(self.filters.get("beta_min", 1.0))
        max_beta = float(self.filters.get("beta_max", 1.5))

        def _value(name: str) -> Optional[float]:
            val = row.get(name)
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
            "market_cap_pass": market_cap is not None and market_cap >= min_market_cap,
            "pe_pass": pe is not None and pe <= max_pe,
            "eps_growth_pass": eps_growth is not None and eps_growth >= min_eps_growth,
            "roe_pass": roe is not None and roe >= min_roe,
            "revenue_growth_pass": revenue_growth is not None and revenue_growth >= min_revenue_growth,
            "beta_pass": beta is not None and min_beta <= beta <= max_beta,
        }
        detail.update(checks)
        detail["passed"] = all(checks.values())
        return detail["passed"], detail
