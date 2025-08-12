export interface OverallReportJsonSchema {
  reportId: string;
  asOfDate: string;
  marketScope: "CN" | "US" | "GLOBAL";
  summary: string;
  opportunities: Array<{
    id: string;
    title: string;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;
    evidences: Array<{ source: string; description: string }>;
  }>;
  risks: Array<{
    id: string;
    title: string;
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;
    evidences: Array<{ source: string; description: string }>;
  }>;
}
