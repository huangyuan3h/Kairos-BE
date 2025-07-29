# Local Development Guide

This guide explains how to set up and debug the Kairos Backend project locally.

## Prerequisites

- Python 3.12
- Node.js 18+
- Docker and Docker Compose
- AWS CLI (optional, for AWS DynamoDB access)

## Quick Start

### 1. Install Dependencies

```bash
make install
```

This will install:

- Node.js dependencies (SST, etc.)
- Python dependencies for core and functions modules

### 2. Setup Local Environment

```bash
make setup-local
```

This creates a `.env.local` file from the template with default settings.

### 3. Start Local DynamoDB (Optional)

If you want to use local DynamoDB instead of AWS:

```bash
make start-local
```

This starts:

- DynamoDB Local on port 8000
- DynamoDB Admin UI on port 8001

### 4. Test Your Setup

```bash
# Test core functionality
make test-debug

# Test Lambda handler
make test-handler
```

## Environment Variables

### Required Variables

| Variable                         | Description           | Default              |
| -------------------------------- | --------------------- | -------------------- |
| `SST_Table_tableName_Securities` | DynamoDB table name   | `Securities-local`   |
| `MARKET`                         | Market identifier     | `CN_A`               |
| `DATA_SOURCE`                    | Data source           | `akshare`            |
| `AKSHARE_FUNC`                   | Akshare function name | `stock_zh_a_spot_em` |
| `TYPE`                           | Security type         | `STOCK`              |

### Optional Variables

| Variable            | Description             | Default                 |
| ------------------- | ----------------------- | ----------------------- |
| `AWS_REGION`        | AWS region              | `us-east-1`             |
| `DYNAMODB_ENDPOINT` | Local DynamoDB endpoint | `http://localhost:8000` |
| `LOG_LEVEL`         | Logging level           | `DEBUG`                 |

## Debugging Options

### Option 1: Local DynamoDB (Recommended for Development)

1. Start local DynamoDB:

   ```bash
   make start-local
   ```

2. Update `.env.local`:

   ```bash
   DYNAMODB_ENDPOINT=http://localhost:8000
   SST_Table_tableName_Securities=Securities-local
   ```

3. Run debug script:
   ```bash
   make test-debug
   ```

### Option 2: AWS DynamoDB (Production-like)

1. Configure AWS credentials:

   ```bash
   aws configure
   ```

2. Deploy the table to AWS:

   ```bash
   npx sst deploy
   ```

3. Update `.env.local` to remove `DYNAMODB_ENDPOINT`

4. Run debug script:
   ```bash
   make test-debug
   ```

## Testing Individual Components

### Test Akshare Client Only

```python
# In Python REPL or script
from core.data.akshare_client import AkshareClient

client = AkshareClient()
securities = client.fetch_securities('stock_zh_a_spot_em')
print(f"Fetched {len(securities)} securities")
```

### Test Repository Only

```python
# In Python REPL or script
import boto3
from core.data.securities_repository import SecuritiesRepository

# Setup DynamoDB connection
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Securities-local')

# Test repository
repo = SecuritiesRepository(table)
securities = repo.get_securities_by_market('CN_A')
print(f"Found {len(securities)} securities")
```

### Test Sync Service Only

```python
# In Python REPL or script
import boto3
from core.services.securities_sync_service import SecuritiesSyncService

# Setup DynamoDB connection
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Securities-local')

# Test sync service
service = SecuritiesSyncService(table)
result = service.sync_securities(
    market='CN_A',
    data_source='akshare',
    akshare_func='stock_zh_a_spot_em',
    security_type='STOCK'
)
print(f"Sync result: {result}")
```

## Troubleshooting

### Common Issues

#### 1. Import Errors

If you get import errors, make sure you're running from the project root:

```bash
cd /path/to/Kairos-BE
python scripts/debug_sync.py
```

#### 2. DynamoDB Connection Issues

For local DynamoDB:

```bash
# Check if DynamoDB is running
curl http://localhost:8000

# Check DynamoDB Admin UI
open http://localhost:8001
```

For AWS DynamoDB:

```bash
# Check AWS credentials
aws sts get-caller-identity

# Check table exists
aws dynamodb describe-table --table-name Securities-local
```

#### 3. Akshare Issues

If akshare fails to fetch data:

```python
# Test akshare directly
import akshare as ak
df = ak.stock_zh_a_spot_em()
print(df.head())
```

#### 4. Environment Variables Not Set

Make sure `.env.local` exists and contains the required variables:

```bash
# Check environment variables
cat .env.local

# Or set them manually
export SST_Table_tableName_Securities=Securities-local
export MARKET=CN_A
export DATA_SOURCE=akshare
export AKSHARE_FUNC=stock_zh_a_spot_em
export TYPE=STOCK
```

## Development Workflow

### 1. Make Changes

Edit the code in the appropriate layer:

- **Models**: `core/src/core/models/`
- **Data**: `core/src/core/data/`
- **Services**: `core/src/core/services/`
- **Handlers**: `functions/src/functions/`

### 2. Test Locally

```bash
# Test core functionality
make test-debug

# Test Lambda handler
make test-handler
```

### 3. Deploy to AWS (Optional)

```bash
npx sst deploy
```

### 4. Monitor Logs

```bash
# View CloudWatch logs
npx sst logs

# Or use AWS CLI
aws logs tail /aws/lambda/kairos-be-Stack-sync-a-share-list --follow
```

## Useful Commands

```bash
# View all available commands
make help

# Clean up everything
make clean

# Restart local environment
make stop-local && make start-local

# Check DynamoDB table
aws dynamodb scan --table-name Securities-local --limit 5
```

## Next Steps

Once you're comfortable with local development:

1. **Add Tests**: Create unit tests for your components
2. **Add Monitoring**: Set up CloudWatch alarms and metrics
3. **Add CI/CD**: Set up automated testing and deployment
4. **Add More Data Sources**: Extend the system for other markets
