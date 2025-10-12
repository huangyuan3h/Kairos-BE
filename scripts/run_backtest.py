#!/usr/bin/env python3
"""Run Swing Falcon backtest using DynamoDB data sources."""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Sequence

import pandas as pd

from core.backtest import (
    BacktestConfig,
    BacktestEngine,
    DynamoFundamentalDataProvider,
    DynamoPriceDataProvider,
)
from core.backtest.data_provider import UniverseProvider
from core.database import Company, MarketData, StockData, RepositoryError
from core.universe import SwingFalconUniverseSelector
from core.strategy import SwingFalconStrategy


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Swing Falcon backtest with DynamoDB data.")
    parser.add_argument("--market-data-table", default=os.getenv("MARKET_DATA_TABLE", "MarketData"))
    parser.add_argument("--stock-data-table", default=os.getenv("STOCK_DATA_TABLE", "StockData"))
    parser.add_argument("--company-table", default=os.getenv("COMPANY_TABLE", "Company"))
    parser.add_argument("--region", default=os.getenv("AWS_REGION"))
    parser.add_argument("--market", default="CN_A", help="Market identifier for universe selection")
    parser.add_argument("--asset-type", default="stock", help="Asset type for universe selection")
    parser.add_argument("--status", default="active", help="Listing status filter for universe selection")
    parser.add_argument("--universe-size", type=int, default=100, help="Max number of symbols in universe")
    parser.add_argument(
        "--start-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(),
        default=(date.today() - timedelta(days=730)),
        help="Backtest start date (YYYY-MM-DD). Defaults to 2 years ago.",
    )
    parser.add_argument(
        "--end-date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(),
        default=date.today(),
        help="Backtest end date (YYYY-MM-DD). Defaults to today.",
    )
    parser.add_argument("--initial-capital", type=float, default=1_000_000.0)
    parser.add_argument("--rebalance", default="weekly", help="Rebalance frequency (daily|weekly|monthly|Nd)")
    parser.add_argument("--output-dir", default="backtest_output", help="Directory for generated reports")
    parser.add_argument("--max-positions", type=int, default=25, help="Max concurrent holdings for strategy")
    parser.add_argument("--price-field", default="adj_close", help="Preferred price field")
    parser.add_argument("--fallback-price-field", default="close", help="Fallback price field")
    parser.add_argument("--universe-cache", default=None, help="Optional CSV to dump selected universe")
    parser.add_argument(
        "--universe-file",
        default=None,
        help="Optional path to a text/CSV file containing one symbol per line",
    )
    parser.add_argument(
        "--universe-list",
        default=None,
        help="Optional comma-separated symbol list overriding automatic discovery",
    )
    parser.add_argument(
        "--dynamic-universe",
        default=None,
        help="Optional JSON file: {\"YYYY-MM-DD\": [\"700\", ...]} for date-specific universes",
    )
    return parser.parse_args()


def _build_universe_provider(
    market_data: MarketData,
    company: Company,
    asset_type: str,
    market: str,
    status: str,
    limit: int,
) -> UniverseProvider:
    def _provider(config: BacktestConfig) -> Sequence[str]:
        try:
            df = market_data.query_stock_catalog_df(
                asset_type=asset_type,
                market=market,
                status=status,
                columns=["symbol"],
                limit=limit,
            )
            if df is not None and not df.empty:
                symbols = df["symbol"].astype(str).str.strip().str.upper().dropna().drop_duplicates().tolist()
                return symbols[:limit]
        except RepositoryError as exc:
            print(
                "[universe] MarketData query failed, falling back to Company byScore index: "
                f"{exc}"
            )
 
        # If MarketData is unavailable (e.g., missing GSI in certain environments),
        # fall back to the Company table's byScore index so that the backtest can
        # still execute with a reasonable subset of symbols.
        try:
            records = company.query_by_score(min_score=0.0, limit=limit)
        except Exception as exc:  # noqa: BLE001
            print(f"[universe] Company query_by_score failed: {exc}")
            return []

        symbols = [str(item.get("pk", "")).strip().upper() for item in records]
        return [sym for sym in symbols if sym][:limit]

    return _provider


def _ensure_output_dir(path_str: str) -> Path:
    path = Path(path_str)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _serialize_trades(trades: Iterable) -> List[dict]:
    serialized: List[dict] = []
    for trade in trades:
        payload = asdict(trade)
        payload["entry_date"] = payload["entry_date"].isoformat()
        payload["exit_date"] = payload["exit_date"].isoformat()
        serialized.append(payload)
    return serialized


def _write_reports(output_dir: Path, result) -> None:
    summary_path = output_dir / "summary.json"
    trades_path = output_dir / "trades.csv"
    equity_path = output_dir / "equity_curve.csv"

    summary_payload = result.to_dict()
    summary_payload["config"] = asdict(result.config)
    summary_payload["equity_curve"] = None  # omit full series for compact summary
    summary_payload["daily_returns"] = None
    summary_payload["daily_turnover"] = None
    summary_payload["trades"] = _serialize_trades(result.trades)
    summary_payload["ending_positions"] = {
        symbol: {
            "quantity": view.quantity,
            "avg_price": view.avg_price,
            "market_price": view.market_price,
            "market_value": view.market_value,
        }
        for symbol, view in result.ending_positions.items()
    }

    with summary_path.open("w", encoding="utf-8") as fp:
        json.dump(summary_payload, fp, indent=2)

    trades_df = pd.DataFrame(summary_payload["trades"])
    trades_df.to_csv(trades_path, index=False)

    equity_df = pd.DataFrame(
        {
            "date": result.equity_curve.index.strftime("%Y-%m-%d"),
            "equity": result.equity_curve.values,
            "daily_return": result.daily_returns.values,
            "turnover": result.daily_turnover.reindex(result.equity_curve.index, fill_value=0.0).values,
        }
    )
    equity_df.to_csv(equity_path, index=False)


def _print_summary(result) -> None:
    print("===== Backtest Summary =====")
    print(f"Total Return: {result.total_return:.2%}")
    print(f"Annualized Return: {result.annualized_return:.2%}")
    print(f"Volatility: {result.volatility:.2%}")
    print(f"Sharpe Ratio: {result.sharpe_ratio:.2f}")
    print(f"Max Drawdown: {result.max_drawdown:.2%}")
    print(f"Win Rate: {result.win_rate:.2%}")
    print(f"Trades: {result.num_trades}")
    print(f"Ending Cash: {result.ending_cash:,.2f}")
    print("Top Positions:")
    for symbol, view in result.ending_positions.items():
        print(
            f"  {symbol}: qty={view.quantity:.2f} avg_price={view.avg_price:.2f} "
            f"market_price={view.market_price:.2f} value={view.market_value:,.2f}"
        )


def main() -> None:
    args = _parse_args()
    output_dir = _ensure_output_dir(args.output_dir)

    market_data = MarketData(table_name=args.market_data_table, region=args.region)
    stock_data = StockData(table_name=args.stock_data_table, region=args.region)
    company = Company(table_name=args.company_table, region=args.region)

    universe_provider = _build_universe_provider(
        market_data=market_data,
        company=company,
        asset_type=args.asset_type,
        market=args.market,
        status=args.status,
        limit=args.universe_size,
    )

    universe_selector = SwingFalconUniverseSelector(
        market_data=market_data,
        company=company,
        market=args.market,
        asset_type=args.asset_type,
        status=args.status,
        limit=args.universe_size,
    )

    price_provider = DynamoPriceDataProvider(stock_data=stock_data)
    fundamental_provider = DynamoFundamentalDataProvider(company=company)

    config = BacktestConfig(
        start_date=args.start_date,
        end_date=args.end_date,
        initial_capital=args.initial_capital,
        rebalance_frequency=args.rebalance,
        max_positions=args.max_positions,
        price_field=args.price_field,
        fallback_price_field=args.fallback_price_field,
    )

    engine = BacktestEngine(
        config=config,
        price_provider=price_provider,
        fundamental_provider=fundamental_provider,
        universe_provider=universe_provider,
    )

    strategy = SwingFalconStrategy(
        max_positions=args.max_positions,
        price_field=args.price_field,
    )

    # Manual universe overrides take precedence over automatic discovery.
    universe_symbols: List[str] = []
    if args.dynamic_universe:
        dynamic_path = Path(args.dynamic_universe)
        if not dynamic_path.exists():
            raise RuntimeError(f"Dynamic universe file {dynamic_path} not found.")
        try:
            mapping = json.loads(dynamic_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:  # noqa: BLE001
            raise RuntimeError(f"Failed to parse dynamic universe JSON: {exc}") from exc

        for symbols in mapping.values():
            if isinstance(symbols, list):
                universe_symbols.extend(str(s).strip().upper() for s in symbols if str(s).strip())
        universe_symbols = sorted({sym for sym in universe_symbols if sym})
        if not universe_symbols:
            raise RuntimeError("Dynamic universe file parsed but yielded no symbols.")
    elif args.universe_file:
        universe_path = Path(args.universe_file)
        if not universe_path.exists():
            universe_path.parent.mkdir(parents=True, exist_ok=True)
            template = (
                "# Swing Falcon universe file generated automatically.\n"
                "# Put one symbol per line (e.g., 700, 1378, 002001).\n"
            )
            universe_path.write_text(template, encoding="utf-8")
            raise RuntimeError(
                f"Universe file {universe_path} did not exist. A template has been created. "
                "Please populate it with symbols and rerun."
            )
        with universe_path.open("r", encoding="utf-8") as fh:
            for line in fh:
                symbol = line.strip().upper()
                if symbol and not symbol.startswith("#"):
                    universe_symbols.append(symbol)
    elif args.universe_list:
        for symbol in args.universe_list.split(","):
            symbol = symbol.strip().upper()
            if symbol:
                universe_symbols.append(symbol)
    else:
        try:
            universe_symbols = universe_selector.select()
        except Exception as selector_exc:  # noqa: BLE001
            print(f"[universe] selector failed: {selector_exc}. Falling back to legacy provider.")
            universe_symbols = list(universe_provider(config))
        if not universe_symbols:
            universe_symbols = list(universe_provider(config))

    if not universe_symbols:
        raise RuntimeError(
            "Universe is empty. Please provide --universe-list/--universe-file or ensure the "
            "MarketData/Company indexes exist."
        )

    if args.universe_cache:
        pd.DataFrame({"symbol": universe_symbols}).to_csv(args.universe_cache, index=False)

    result = engine.run(strategy, universe=universe_symbols)

    _write_reports(output_dir, result)
    _print_summary(result)
    print(f"Reports written to: {output_dir.resolve()}")


if __name__ == "__main__":  # pragma: no cover
    main()
