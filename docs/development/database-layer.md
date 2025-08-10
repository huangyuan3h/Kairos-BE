# Database Layer (DynamoDB)

This document outlines the database access layer under `core/src/core/database`, designed as a clean abstraction for DynamoDB access.

## Structure

- `client.py`: Creates DynamoDB table resource from config.
- `keys.py`: Consistent key builders for PK/SK/GSIs.
- `repository.py`: High-level CRUD and query helpers (symbol-based and market+status patterns).
- `types.py`: Common typed item shapes.
- `exceptions.py`: Stable exception for repository failures.

## Key Strategy

- Single-table design with `pk`/`sk` and two GSIs:
  - `bySymbol` (`gsi1pk`, `gsi1sk`)
  - `byMarketStatus` (`gsi2pk`, `gsi2sk`)
- Prefix convention: `STOCK#<symbol>`, `META#<type>#<ts>`, `QUOTE#<date>` etc.

## Usage

```python
from core.database import (
    DynamoConfig,
    get_dynamo_table,
    DynamoRepository,
    make_pk_stock,
    make_sk_meta,
    make_gsi1pk_symbol,
    make_gsi1sk_entity,
)

config = DynamoConfig(table_name="MarketData")
table = get_dynamo_table(config)
repo = DynamoRepository(table)

item = {
    "pk": make_pk_stock("600519"),
    "sk": make_sk_meta("PROFILE", "2025-08-08T00:00:00Z"),
    "gsi1pk": make_gsi1pk_symbol("600519"),
    "gsi1sk": make_gsi1sk_entity("PROFILE", "2025-08-08T00:00:00Z"),
}
repo.put_item(item)
```

## Notes

- The AWS Lambda Python runtime ships with `boto3`.
- For local development, ensure AWS credentials and region are configured.
