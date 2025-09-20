from __future__ import annotations

from typing import Any, Dict, List, Optional
from decimal import Decimal

import boto3  # type: ignore


class Company:
    """Repository for the Company table (one item per company).

    Key model:
      - pk: company code (e.g., SH600519)
      - GSI byScore: gsi1pk="SCORE", gsi1sk="<score padded>#<symbol>"
    """

    def __init__(self, table_name: str, region: Optional[str] = None) -> None:
        self._table_name = table_name
        self._dynamo = boto3.resource("dynamodb", region_name=region)
        self._table = self._dynamo.Table(table_name)

    @property
    def table_name(self) -> str:
        return self._table_name

    def put_company(self, item: Dict[str, Any]) -> None:
        """Upsert a company item. Caller must provide pk and score/GSI fields.

        DynamoDB does not support native Python float. Convert all float values to Decimal.
        This function performs a deep conversion for dicts and lists.
        """

        def _convert(value: Any) -> Any:
            # Convert floats to Decimal using string constructor to preserve precision
            if isinstance(value, float):
                return Decimal(str(value))
            # Integers and booleans are directly supported
            if isinstance(value, (int, bool)):
                return value
            # Strings and None are directly supported (None maps to NULL)
            if value is None or isinstance(value, str):
                return value
            # Lists: convert each element
            if isinstance(value, list):
                return [_convert(v) for v in value]
            # Dicts: convert each value
            if isinstance(value, dict):
                return {k: _convert(v) for k, v in value.items()}
            # Fallback: leave as-is (DynamoDB may reject unsupported types)
            return value

        item_converted = _convert(item)
        self._table.put_item(Item=item_converted)

    def get_company(self, symbol: str) -> Optional[Dict[str, Any]]:
        res = self._table.get_item(Key={"pk": symbol})
        return res.get("Item")  # type: ignore[return-value]

    def query_by_score(self, min_score: float, limit: int = 100) -> List[Dict[str, Any]]:
        """Query companies with score >= min_score using the byScore GSI.

        Note: Requires scanning descending; DynamoDB cannot do >= on sort key when
        using descending without a known prefix, so we invert by padding and using
        a greater-than-or-equal string compare.
        """
        score_key = f"{min_score:08.3f}#"
        resp = self._table.query(
            IndexName="byScore",
            KeyConditionExpression="gsi1pk = :pk AND gsi1sk >= :sk",
            ExpressionAttributeValues={":pk": "SCORE", ":sk": score_key},
            Limit=limit,
            ScanIndexForward=True,
        )
        return resp.get("Items", [])  # type: ignore[return-value]


