from __future__ import annotations

from typing import Any, Dict, List, Optional

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
        """Upsert a company item. Caller must provide pk and score/GSI fields."""
        self._table.put_item(Item=item)

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


