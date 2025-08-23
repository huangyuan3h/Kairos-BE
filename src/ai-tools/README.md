# AI Tools

A simple and lightweight module for AI tools used in the Kairos BE project.

## Architecture

The ai-tools module provides a clean and simple interface for AI tools:

- **`base.ts`** - Core tool interfaces and base classes
- **`market.ts`** - Market-specific analysis tools
- **`index.ts`** - Main exports and helper functions

## Usage

### Basic Usage

```typescript
import { getMarketAnalysisTools, getAllTools } from "@/ai-tools";

// Get all available tools
const tools = getAllTools();

// Get market analysis tools specifically
const marketTools = getMarketAnalysisTools();
```

### Using with AI Agent

```typescript
import { createAiAgent } from "@/ai-agent/agent";
import { getMarketAnalysisTools } from "@/ai-tools";

const aiAgent = createAiAgent({
  model: "gemini-1.5-flash",
  tools: getMarketAnalysisTools(),
});

const response = await aiAgent.chat([
  { role: "user", content: "Analyze the current market trends" },
]);
```

### Creating Custom Tools

```typescript
import { BaseAiTool, ToolCategory } from "@/ai-tools";
import { z } from "zod";

export class MarketDataTool extends BaseAiTool {
  name = "market_data";
  description = "Get market data and trends analysis";
  category = ToolCategory.MARKET_DATA;

  inputSchema = z.object({
    marketScope: z.enum(["CN", "US", "GLOBAL"]).describe("Market scope"),
    asOfDate: z.string().describe("Analysis date"),
  });

  protected async executeImpl(input: {
    marketScope: string;
    asOfDate: string;
  }) {
    // Your tool implementation
    return {
      marketScope: input.marketScope,
      asOfDate: input.asOfDate,
      data: {
        /* mock data */
      },
    };
  }
}
```

## Available Tools

### Market Analysis Tools

- **`MarketDataTool`** - Get market data and trends analysis
- **`NewsAnalysisTool`** - Analyze news headlines for market impact

## Best Practices

1. **Keep it Simple**: Tools should focus on a single responsibility
2. **Error Handling**: Tools should handle errors gracefully
3. **Input Validation**: Use Zod schemas for input validation
4. **Documentation**: Provide clear descriptions for all parameters
5. **Testing**: Test tools independently before integrating

## Development

When adding new tools:

1. Create the tool class extending `BaseAiTool`
2. Implement the required abstract methods
3. Add the tool to `market.ts` or create a new category file
4. Export the tool from `index.ts`
5. Update this README with the new tool
