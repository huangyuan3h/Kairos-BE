"use client";

import { useEffect, useMemo, useState } from "react";
import ReportViewer from "../components/report-viewer";
import { ReportFile, listReportFiles, loadReport } from "../lib/report-loader";
import { ReportPayload } from "../lib/types";

export default function Page() {
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [selectedReport, setSelectedReport] = useState<string>("");
  const [reportData, setReportData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    try {
      const reportFiles = listReportFiles();
      setReports(reportFiles);
      if (reportFiles.length > 0) {
        setSelectedReport(reportFiles[0].file);
        setReportData(loadReport(reportFiles[0].file));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const strategyNames = useMemo(() => {
    if (!reportData?.strategy) return [];
    return [
      {
        label: reportData.strategy.name || "Unknown Strategy",
        value: 0,
      },
    ];
  }, [reportData]);

  const [strategyIndex, setStrategyIndex] = useState(0);

  useEffect(() => {
    setStrategyIndex(0);
  }, [selectedReport]);

  const selectedStrategy = reportData?.strategy;

  if (error) {
    return (
      <main className="p-8">
        <div className="bg-red-900/50 border border-red-400 text-red-200 px-4 py-3 rounded">
          <strong className="font-semibold">加载报告失败:</strong> {error}
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">
            Backtest Dashboard
          </h1>
          <p className="text-slate-400 mt-1">选择一份报告查看详情</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              报告文件
            </label>
            <select
              value={selectedReport}
              onChange={event => {
                const file = event.target.value;
                setSelectedReport(file);
                setReportData(loadReport(file));
              }}
              className="bg-slate-900 border border-slate-700 px-3 py-2 rounded text-sm text-white"
            >
              {reports.map(report => (
                <option key={report.key} value={report.file}>
                  {report.label}
                </option>
              ))}
            </select>
          </div>
          {strategyNames.length > 1 && (
            <div>
              <label className="block text-sm text-slate-300 mb-1">策略</label>
              <select
                value={strategyIndex}
                onChange={event => setStrategyIndex(Number(event.target.value))}
                className="bg-slate-900 border border-slate-700 px-3 py-2 rounded text-sm text-white"
              >
                {strategyNames.map(strategy => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {selectedStrategy ? (
        <ReportViewer strategy={selectedStrategy} />
      ) : (
        <div className="text-slate-400">未找到策略数据。</div>
      )}
    </main>
  );
}
