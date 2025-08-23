import { z } from 'zod';
import { AiTool } from '../agent';

// Example tool: Calculator
export const calculatorTool: AiTool = {
  name: 'calculator',
  description: 'Perform basic mathematical calculations',
  inputSchema: z.object({
    expression: z.string().describe('Mathematical expression to evaluate')
  }),
  execute: async (input: { expression: string }) => {
    try {
      // Simple expression evaluation (in production, use a proper math library)
      const result = eval(input.expression);
      return { result, expression: input.expression };
    } catch (error) {
      throw new Error(`Invalid mathematical expression: ${input.expression}`);
    }
  }
};

// Example tool: Weather API (mock)
export const weatherTool: AiTool = {
  name: 'get_weather',
  description: 'Get current weather information for a location',
  inputSchema: z.object({
    location: z.string().describe('City or location name'),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('Temperature unit')
  }),
  execute: async (input: { location: string; unit: string }) => {
    // Mock weather data - in production, this would call a real weather API
    const mockWeather = {
      location: input.location,
      temperature: input.unit === 'celsius' ? 22 : 72,
      unit: input.unit,
      condition: 'Sunny',
      humidity: 65,
      windSpeed: 12
    };
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return mockWeather;
  }
};

// Example tool: File operations (mock)
export const fileTool: AiTool = {
  name: 'file_operations',
  description: 'Perform file operations like read, write, or list',
  inputSchema: z.object({
    operation: z.enum(['read', 'write', 'list']).describe('File operation to perform'),
    path: z.string().describe('File path'),
    content: z.string().optional().describe('Content to write (for write operation)')
  }),
  execute: async (input: { operation: string; path: string; content?: string }) => {
    switch (input.operation) {
      case 'read':
        return { operation: 'read', path: input.path, content: `Mock content for ${input.path}` };
      case 'write':
        return { operation: 'write', path: input.path, success: true, bytesWritten: input.content?.length || 0 };
      case 'list':
        return { operation: 'list', path: input.path, files: ['file1.txt', 'file2.txt', 'folder1'] };
      default:
        throw new Error(`Unsupported operation: ${input.operation}`);
    }
  }
};

// Tool collection for different use cases
export const basicTools = [calculatorTool];
export const weatherTools = [weatherTool];
export const fileTools = [fileTool];
export const allTools = [calculatorTool, weatherTool, fileTool];
