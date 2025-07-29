# Kairos Backend - Investment Data Platform

A serverless investment data platform built with SST (Serverless Stack) for syncing and managing securities data from various markets.

## Architecture

### Core Components

#### Functions Layer (`/functions`)

- **Lambda Handlers**: Entry points for AWS Lambda functions
  - `securities_sync_handler.py`: Handler for securities synchronization jobs
  - Clean separation of concerns - handlers only manage Lambda-specific logic

#### Core Layer (`/core`) - Layered Architecture

**Config Layer (`/core/config`)**

- `settings.py`: Centralized configuration for markets and DynamoDB
- No environment variable dependencies - all config in code

**Models Layer (`/core/models`)**

- `securities.py`: Data models for securities and sync results
- Type-safe data structures using dataclasses

**Data Layer (`/core/data`)**

- `securities_repository.py`: DynamoDB operations and data persistence
- `akshare_client.py`: External API client for akshare data source
- Repository pattern for clean data access abstraction

**Services Layer (`/core/services`)**

- `market_sync_service.py`: Business logic for market-specific sync operations
- Each market has its own sync method (e.g., `sync_chinese_a_shares()`)
- `sync_all_markets()` orchestrates all market syncs

#### Infrastructure (`sst.config.ts`)

- DynamoDB table for storing securities data
- CloudWatch Events (Cron) for scheduled sync jobs

### Data Model

The DynamoDB table stores securities with the following structure:

- **Primary Key**: `market` (partition key) + `symbol` (sort key)
- **Global Secondary Index**: `type` (partition key) + `symbol` (sort key)
- **Additional Fields**: name, isEnabled, dataSource, updatedAt, currentPrice, etc.

## Configuration

### Market Configuration (`core/src/core/config/settings.py`)

All market configurations are centralized in the Settings class:

```python
MARKETS = {
    "CN_A": {
        "name": "Chinese A-Shares",
        "data_source": "akshare",
        "akshare_func": "stock_zh_a_spot_em",
        "security_type": "STOCK"
    }
}
```

### Sync Jobs (`sync_config.yml`)

Simplified configuration without environment variables:

```yaml
jobs:
  - name: "sync-securities"
    description: "Sync securities data for all supported markets."
    schedule: "cron(0 22 1 * ? *)" # Monthly on 1st at 22:00 UTC
    handler: "functions/src/functions/securities_sync_handler.sync_securities_list"
    # No parameters needed - configuration is centralized
```

## Development

### Prerequisites

- Python 3.12
- Node.js 18+
- AWS CLI (for deployment)

### Setup

1. Install dependencies:

   ```bash
   npm install
   cd core && pip install -e .
   cd ../functions && pip install -e .
   ```

2. Deploy to AWS:
   ```bash
   npx sst deploy
   ```

### Local Development

#### VS Code Debugging

1. Open the project in VS Code
2. Set breakpoints in `debug.py` or any core module
3. Run `debug.py` with the Python debugger

#### Unit Testing

```bash
# Run unit tests
python -m pytest tests/

# Run specific test
python -m pytest tests/test_market_sync.py
```

### Adding New Markets

1. **Add market configuration** in `core/src/core/config/settings.py`:

   ```python
   "US": {
       "name": "US Stocks",
       "data_source": "akshare",
       "akshare_func": "stock_us_spot_em",
       "security_type": "STOCK"
   }
   ```

2. **Add sync method** in `core/src/core/services/market_sync_service.py`:

   ```python
   def sync_us_stocks(self) -> Dict[str, Any]:
       # Implementation for US stocks
       pass
   ```

3. **Update sync_all_markets()** to include the new market

### Business Logic Flow

1. **Lambda Handler** (`sync_securities_list`) is triggered by CloudWatch Events
2. **Handler** calls `MarketSyncService.sync_all_markets()`
3. **Service** sequentially calls market-specific sync methods:
   - `sync_chinese_a_shares()`
   - `sync_us_stocks()` (future)
   - etc.
4. **Each sync method**:
   - Gets market config from Settings
   - Fetches data via AkshareClient
   - Stores data via SecuritiesRepository

## Architecture Benefits

### Simplicity

- No complex environment variable management
- Centralized configuration in code
- Clear, explicit business methods

### Maintainability

- Each market has its own sync method
- Easy to add new markets
- Clear separation of concerns

### Testability

- Simple unit tests with mocks
- Easy to debug in VS Code
- No complex local setup required

## Current Features

- ✅ Chinese A-shares synchronization via akshare
- ✅ Monthly scheduled sync jobs
- ✅ DynamoDB storage with efficient batch operations
- ✅ Centralized configuration
- ✅ Market-specific sync methods
- ✅ Simple unit testing
- ✅ VS Code debugging support

## Future Enhancements

- [ ] US stocks synchronization
- [ ] ETF data support
- [ ] Real-time price updates
- [ ] Historical data backfilling
- [ ] Data quality validation
- [ ] Performance monitoring and alerts
