"""
Macro/Index catalog (minimal schema for the main table).

This module provides a curated list of macro indicators and broad
indexes used for top-down opportunity scanning.
"""

# pyright: reportMissingTypeStubs=false, reportMissingImports=false

import json
import logging
from pathlib import Path
from typing import Iterable, Mapping, List, Dict, Any

import pandas as pd  # type: ignore[import]

logger = logging.getLogger(__name__)


def _rows_to_dataframe(rows: Iterable[Mapping[str, str]]) -> pd.DataFrame:
    df = pd.DataFrame(list(rows))
    required = {"symbol", "name", "exchange", "asset_type", "market", "status"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    ordered = ["symbol", "name", "exchange", "asset_type", "market", "status"]
    return df[ordered]


def _load_config_rows() -> List[Dict[str, Any]]:
    """Try to load catalog rows from a local JSON config file.

    If the config file is missing or invalid, return an empty list.
    """
    config_path = Path(__file__).with_name("catalog_config.json")
    if not config_path.exists():
        return []
    try:
        with config_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]
        return []
    except Exception as exc:
        logger.warning("Failed to load index catalog_config.json: %s", exc)
        return []


def get_index_catalog() -> pd.DataFrame:
    """Return a compact but high-signal macro/index catalog (unified schema).

    Priority: use local JSON config if present; otherwise use built-in defaults.
    """
    rows = _load_config_rows() or [
        # Liquidity / Risk appetite
        {"symbol": "GLOBAL:DXY", "name": "US Dollar Index (DXY)"},
        {"symbol": "GLOBAL:VIX", "name": "CBOE Volatility Index (VIX)"},
        {"symbol": "GLOBAL:MOVE", "name": "ICE BofA MOVE Index"},
        {"symbol": "GLOBAL:BDI", "name": "Baltic Dry Index (BDI)"},

        # Rates & curve
        {"symbol": "US:UST10Y", "name": "US 10Y Treasury Yield"},
        {"symbol": "US:UST2Y", "name": "US 2Y Treasury Yield"},
        {"symbol": "US:YC2Y10Y", "name": "US 2s10s Yield Curve Spread"},
        {"symbol": "CN:CGB10Y", "name": "China 10Y Government Bond Yield"},

        # Commodities & inflation proxies
        {"symbol": "GLOBAL:CRB", "name": "CRB Commodity Index"},
        {"symbol": "GLOBAL:WTI", "name": "WTI Crude Oil"},
        {"symbol": "GLOBAL:BRENT", "name": "Brent Crude Oil"},
        {"symbol": "GLOBAL:GOLD", "name": "Gold (Spot)"},
        {"symbol": "GLOBAL:COPPER", "name": "Copper (Spot)"},
        {"symbol": "GLOBAL:COPPER_GOLD_RATIO", "name": "Copper/Gold Ratio"},

        # Equities (broad)
        {"symbol": "US:SPX", "name": "S&P 500 Index"},
        {"symbol": "US:NDX", "name": "Nasdaq-100 Index"},
        {"symbol": "GLOBAL:MSCI_WORLD", "name": "MSCI World Index"},
        {"symbol": "GLOBAL:MSCI_EM", "name": "MSCI Emerging Markets Index"},
        {"symbol": "CN:CSI300", "name": "CSI 300 Index"},
        {"symbol": "CN:SSE50", "name": "SSE 50 Index"},
        {"symbol": "CN:CHINEXT", "name": "ChiNext Index"},

        # Crypto (risk appetite proxy)
        {"symbol": "GLOBAL:BTCUSD", "name": "Bitcoin (USD)"},
        {"symbol": "GLOBAL:ETHUSD", "name": "Ethereum (USD)"},
        {"symbol": "GLOBAL:BTC_DOM", "name": "Bitcoin Dominance"},
    ]

    # Enrich fixed columns
    for r in rows:
        r.setdefault("exchange", "GLOBAL")
        r.setdefault("asset_type", "index")
        r.setdefault("market", "INDEX")
        r.setdefault("status", "active")

    logger.info("Prepared index catalog entries: %d", len(rows))
    return _rows_to_dataframe(rows)


def get_main_index_catalog() -> pd.DataFrame:
    """Return P0 main indexes and ETFs for daily regime analysis.

    The list includes CN major indexes, US broad indexes, and key ETFs.
    Schema is unified with the main table catalog format.
    """
    rows: List[Dict[str, Any]] = [
        # US broad indexes
        {"symbol": "US:SPX", "name": "S&P 500 Index", "exchange": "US", "asset_type": "index", "market": "INDEX", "status": "active"},
        {"symbol": "US:NDX", "name": "Nasdaq-100 Index", "exchange": "US", "asset_type": "index", "market": "INDEX", "status": "active"},
        {"symbol": "US:RUT", "name": "Russell 2000 Index", "exchange": "US", "asset_type": "index", "market": "INDEX", "status": "active"},

        # CN major indexes
        {"symbol": "CN:CSI300", "name": "CSI 300 Index", "exchange": "CN", "asset_type": "index", "market": "INDEX", "status": "active"},
        {"symbol": "CN:SHCOMP", "name": "Shanghai Composite Index", "exchange": "CN", "asset_type": "index", "market": "INDEX", "status": "active"},
        {"symbol": "CN:CSI500", "name": "CSI 500 Index", "exchange": "CN", "asset_type": "index", "market": "INDEX", "status": "active"},

        # Key ETFs (US) → treat as index for simplified asset taxonomy
        {"symbol": "US:SPY", "name": "SPDR S&P 500 ETF", "exchange": "US", "asset_type": "index", "market": "US", "status": "active"},
        {"symbol": "US:QQQ", "name": "Invesco QQQ Trust", "exchange": "US", "asset_type": "index", "market": "US", "status": "active"},
        {"symbol": "US:IWM", "name": "iShares Russell 2000 ETF", "exchange": "US", "asset_type": "index", "market": "US", "status": "active"},
    ]

    return _rows_to_dataframe(rows)


__all__ = ["get_index_catalog", "get_main_index_catalog"]

