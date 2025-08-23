/**
 * Domain types for the overall report.
 */
export interface Evidence {
  source: string;
  description: string;
}

export interface Signal {
  id: string;
  title: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  evidences: Evidence[];
}

export interface OverallReport {
  reportId: string;
  asOfDate: string;
  title: string;
  content: string;
  createdAt: string;
}
