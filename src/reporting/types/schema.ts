import { z } from "zod";

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

export const OverallReportZodSchema = z.object({
  reportId: z.string(),
  asOfDate: z.string(),
  marketScope: z.enum(["CN", "US", "GLOBAL"]),
  summary: z.string(),
  opportunities: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
        confidence: z.number().min(0).max(1),
        evidences: z.array(
          z.object({
            source: z.string(),
            description: z.string(),
          })
        ),
      })
    )
    .default([]),
  risks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
        confidence: z.number().min(0).max(1),
        evidences: z.array(
          z.object({
            source: z.string(),
            description: z.string(),
          })
        ),
      })
    )
    .default([]),
});
