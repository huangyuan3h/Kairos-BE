import type { OverallReport } from "../domain/types";

/**
 * Base interface for all AI agent tools
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Market analysis tool for gathering financial data and insights
 */
export interface MarketAnalysisTool extends AgentTool {
  name: "market_analysis";
  description: "Analyze market data, trends, and technical indicators for a specific market and date";
  parameters: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    analysisType?: "technical" | "fundamental" | "sentiment" | "comprehensive";
  };
  execute(params: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    analysisType?: "technical" | "fundamental" | "sentiment" | "comprehensive";
  }): Promise<{
    marketTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
    confidence: number;
    keyIndicators: Array<{
      name: string;
      value: number;
      interpretation: string;
    }>;
    summary: string;
  }>;
}

/**
 * News sentiment analysis tool for processing financial news
 */
export interface NewsSentimentTool extends AgentTool {
  name: "news_sentiment";
  description: "Analyze news headlines and articles for sentiment and market impact";
  parameters: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    timeRange?: "1d" | "3d" | "1w";
  };
  execute(params: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    timeRange?: "1d" | "3d" | "1w";
  }): Promise<{
    overallSentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    sentimentScore: number;
    topHeadlines: Array<{
      title: string;
      sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
      impact: "HIGH" | "MEDIUM" | "LOW";
      summary: string;
    }>;
    marketImpact: string;
  }>;
}

/**
 * Risk assessment tool for identifying market risks and opportunities
 */
export interface RiskAssessmentTool extends AgentTool {
  name: "risk_assessment";
  description: "Assess market risks and identify investment opportunities";
  parameters: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    riskTolerance?: "LOW" | "MEDIUM" | "HIGH";
  };
  execute(params: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    riskTolerance?: "LOW" | "MEDIUM" | "HIGH";
  }): Promise<{
    risks: Array<{
      category: string;
      severity: "LOW" | "MEDIUM" | "HIGH";
      probability: number;
      description: string;
      mitigation: string;
    }>;
    opportunities: Array<{
      category: string;
      potential: "LOW" | "MEDIUM" | "HIGH";
      confidence: number;
      description: string;
      catalysts: string[];
    }>;
    overallRiskLevel: "LOW" | "MEDIUM" | "HIGH";
  }>;
}

/**
 * Report composition tool for generating the final report
 */
export interface ReportCompositionTool extends AgentTool {
  name: "report_composition";
  description: "Compose the final overall market report using gathered insights";
  parameters: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    insights: {
      marketAnalysis: unknown;
      newsSentiment: unknown;
      riskAssessment: unknown;
    };
  };
  execute(params: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
    insights: {
      marketAnalysis: unknown;
      newsSentiment: unknown;
      riskAssessment: unknown;
    };
  }): Promise<OverallReport>;
}

/**
 * Tool registry for AI agent to discover and use available tools
 */
export interface ToolRegistry {
  getTool(name: string): AgentTool | undefined;
  listTools(): AgentTool[];
  registerTool(tool: AgentTool): void;
}

/**
 * AI agent orchestrator for managing the report generation workflow
 */
export interface AgentOrchestrator {
  /**
   * Execute the complete report generation workflow
   */
  generateReport(params: {
    marketScope: "CN" | "US" | "GLOBAL";
    asOfDate: string;
  }): Promise<OverallReport>;

  /**
   * Execute a specific tool
   */
  executeTool(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<unknown>;

  /**
   * Get available tools
   */
  getAvailableTools(): AgentTool[];
}
