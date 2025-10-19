"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  ChartConfiguration,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title as ChartTitle,
  CategoryScale,
} from "chart.js";
import clsx from "clsx";
import { DataRow, StrategyPayload } from "../lib/types";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  ChartTitle,
  CategoryScale
);

interface ReportViewerProps {
  strategy: StrategyPayload;
}

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

const metricItems: Array<{
  key: string;
  label: string;
  formatter: (value?: number) => string;
}> = [
  { key: "total_return", label: "总收益", formatter: formatPercent },
  { key: "annualized_return", label: "年化收益", formatter: formatPercent },
  { key: "volatility", label: "波动率", formatter: formatPercent },
  {
    key: "sharpe_ratio",
    label: "夏普比率",
    formatter: value => formatNumber(value),
  },
  { key: "max_drawdown", label: "最大回撤", formatter: formatPercent },
  { key: "win_rate", label: "胜率", formatter: formatPercent },
];

export default function ReportViewer({ strategy }: ReportViewerProps) {
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const labels = strategy.equity_curve.map(point => point.date);
    const data = strategy.equity_curve.map(point => point.equity);

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Equity",
            data,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.2)",
            tension: 0.15,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            display: true,
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
          y: {
            display: true,
            ticks: { color: "#94a3b8" },
            grid: { color: "#1e293b" },
          },
        },
        plugins: {
          legend: {
            labels: { color: "#e2e8f0" },
          },
        },
      },
    };

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }
    chartInstanceRef.current = new Chart(chartRef.current, config);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [strategy.equity_curve]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {metricItems.map(metric => (
          <div
            key={metric.key}
            className="bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-3 shadow-lg"
          >
            <div className="text-xs uppercase text-slate-400">
              {metric.label}
            </div>
            <div className="text-xl font-semibold text-white mt-1">
              {metric.formatter(strategy.summary?.[metric.key])}
            </div>
          </div>
        ))}
        <div className="bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-3 shadow-lg">
          <div className="text-xs uppercase text-slate-400">交易笔数</div>
          <div className="text-xl font-semibold text-white mt-1">
            {strategy.summary?.num_trades ?? 0}
          </div>
        </div>
      </section>

      <section className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-white mb-4">收益曲线</h2>
        <div className="h-80">
          <canvas ref={chartRef} />
        </div>
      </section>

      <DataTable
        title="交易明细"
        description="排序按交易时间，可导出原始 CSV"
        rows={strategy.trades}
        emptyMessage="当前策略没有交易记录"
        className="bg-slate-900/80"
      />

      <DataTable
        title="最新信号"
        description="最新一次回测结束时的建议持仓"
        rows={strategy.signals}
        emptyMessage="暂无信号数据"
        className="bg-slate-900/80"
      />

      <DataTable
        title="股票池"
        description="当前策略筛选出的候选股票"
        rows={strategy.universe}
        emptyMessage="暂无股票池数据"
        className="bg-slate-900/80"
      />
    </div>
  );
}

interface DataTableProps {
  title: string;
  description?: string;
  rows: DataRow[];
  emptyMessage?: string;
  className?: string;
}

function DataTable({
  title,
  description,
  rows,
  emptyMessage = "暂无数据",
  className,
}: DataTableProps) {
  const headers = rows?.length ? Object.keys(rows[0]) : [];
  return (
    <section
      className={clsx(
        "border border-slate-800 rounded-lg p-6 shadow-lg",
        className
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? (
            <p className="text-sm text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {rows?.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                {headers.map(header => (
                  <th
                    key={header}
                    className="px-3 py-2 text-left text-slate-300"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className="odd:bg-slate-900/60 even:bg-slate-900/30"
                >
                  {headers.map(header => (
                    <td key={header} className="px-3 py-2 text-slate-100">
                      {normalizeValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-slate-400">{emptyMessage}</div>
      )}
    </section>
  );
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4);
  }
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
