# Lint-Staged and Husky Setup

This project is configured with lint-staged and husky to automatically fix linting issues before commits.

## What's Configured

### 1. Lint-Staged
- Automatically runs ESLint with `--fix` flag on staged TypeScript/JavaScript files
- Only processes files that are staged for commit (improves performance)
- Runs both `eslint --fix` and `eslint` to ensure code quality

### 2. Husky
- Manages Git hooks automatically
- Ensures all team members execute the same pre-commit checks
- Runs `npx lint-staged` before each commit

### 3. Pre-Commit Hook
- Automatically executes when `git commit` is run
- Fixes auto-fixable linting issues
- Blocks commit if there are unfixable linting errors

## How It Works

1. **Developer stages files**: `git add <files>`
2. **Developer commits**: `git commit -m "message"`
3. **Pre-commit hook triggers**: Automatically runs `npx lint-staged`
4. **Lint-staged processes staged files**: Only TypeScript/JavaScript files in staging area
5. **ESLint fixes issues**: Automatically fixes problems that can be auto-fixed
6. **Commit proceeds**: If all issues are resolved, commit completes

## Configuration Files

### package.json
```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": [
      "eslint --fix",
      "eslint"
    ]
  }
}
```

### .husky/pre-commit
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

## Benefits

- **Performance**: Only checks staged files, not entire project
- **Consistency**: All developers run the same checks
- **Automation**: Auto-fixes common issues
- **Quality Gate**: Prevents commits with unfixable linting errors

## Troubleshooting

### If pre-commit hook fails:
1. Check the error message for specific linting issues
2. Fix the issues manually if they can't be auto-fixed
3. Stage the fixed files again
4. Try committing again

### If lint-staged shows "No staged files found":
- Make sure you have staged files with `git add`
- Only TypeScript/JavaScript files trigger lint-staged

### If you need to bypass the hook (emergency only):
```bash
git commit --no-verify -m "emergency commit"
```

## Adding New Team Members

When a new developer clones the repository:
1. Run `npm install` to install dependencies
2. The `prepare` script in package.json automatically sets up husky
3. Pre-commit hooks will work automatically

## File Types Supported

- `.ts` - TypeScript files
- `.tsx` - TypeScript React files  
- `.js` - JavaScript files
- `.jsx` - JavaScript React files
