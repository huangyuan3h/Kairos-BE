# Path Aliases

This project uses TypeScript path aliases to improve import readability and maintainability.

## Available Aliases

- `@src/*` → `src/*` - Points to the main source directory

## Usage Examples

### Before (Relative Paths)

```typescript
import type { GenerateOverallReportInput } from "../../../../src/reporting/application/generate_overall_report";
import { generateOverallReport } from "../../../../src/reporting/application/generate_overall_report";
import { DynamoTable, getDynamoTableName } from "../../../../src/util/dynamodb";
```

### After (Path Aliases)

```typescript
import type { GenerateOverallReportInput } from "@src/reporting/application/generate_overall_report";
import { generateOverallReport } from "@src/reporting/application/generate_overall_report";
import { DynamoTable, getDynamoTableName } from "@src/util/dynamodb";
```

## Configuration

The path aliases are configured in:

- **Root**: `tsconfig.json` - Main configuration with `@src/*` mapping
- **Functions**: `functions/tsconfig.json` - Extends root config for Lambda functions

## Benefits

1. **Readability**: No more counting `../` levels
2. **Maintainability**: Moving files doesn't break imports
3. **Consistency**: Same import pattern across the project
4. **IDE Support**: Better autocomplete and navigation

## Important Notes

- Always use `--project` flag when running `tsc` to ensure path resolution works
- The alias works in both root and functions directories
- Existing relative imports continue to work for backward compatibility
