from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence
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

    def batch_get_companies(
        self,
        symbols: Iterable[str],
        attributes: Optional[Sequence[str]] = None,
        consistent_read: bool = False,
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch multiple company records efficiently using DynamoDB batch_get_item.

        Parameters
        ----------
        symbols:
            Iterable of company primary keys (e.g., SH600519).
        attributes:
            Optional subset of attributes to project. The partition key ``pk`` is always
            returned regardless of projection.
        consistent_read:
            When True, issues strongly consistent reads. Defaults to eventually
            consistent for lower latency/cost.
        """

        norm_symbols = [str(s).strip().upper() for s in symbols if str(s).strip()]
        if not norm_symbols:
            return {}

        unique_symbols = list(dict.fromkeys(norm_symbols))

        def _from_dynamo(value: Any) -> Any:
            if isinstance(value, Decimal):
                return float(value)
            if isinstance(value, list):
                return [_from_dynamo(v) for v in value]
            if isinstance(value, dict):
                return {k: _from_dynamo(v) for k, v in value.items()}
            return value

        projection_expression: Optional[str] = None
        if attributes:
            # Ensure primary key is always included in projection
            fields = {"pk"}
            fields.update(str(attr) for attr in attributes if attr)
            projection_expression = ",".join(sorted(fields))

        def _chunk(seq: List[str], size: int = 100) -> Iterable[List[str]]:
            for i in range(0, len(seq), size):
                yield seq[i : i + size]

        results: Dict[str, Dict[str, Any]] = {}

        for chunk in _chunk(unique_symbols):
            keys = [{"pk": sym} for sym in chunk]
            request: Dict[str, Any] = {self._table_name: {"Keys": keys, "ConsistentRead": consistent_read}}
            if projection_expression:
                request[self._table_name]["ProjectionExpression"] = projection_expression

            response = self._dynamo.batch_get_item(RequestItems=request)

            items = response.get("Responses", {}).get(self._table_name, [])
            for item in items:
                pk = str(item.get("pk", "")).strip().upper()
                if not pk:
                    continue
                results[pk] = _from_dynamo(item)

            unprocessed = response.get("UnprocessedKeys", {}).get(self._table_name, {}).get("Keys", [])
            while unprocessed:
                retry_request: Dict[str, Any] = {
                    self._table_name: {"Keys": unprocessed, "ConsistentRead": consistent_read}
                }
                if projection_expression:
                    retry_request[self._table_name]["ProjectionExpression"] = projection_expression
                retry_response = self._dynamo.batch_get_item(RequestItems=retry_request)
                items_retry = retry_response.get("Responses", {}).get(self._table_name, [])
                for item in items_retry:
                    pk = str(item.get("pk", "")).strip().upper()
                    if not pk:
                        continue
                    results[pk] = _from_dynamo(item)
                unprocessed = (
                    retry_response.get("UnprocessedKeys", {}).get(self._table_name, {}).get("Keys", [])
                )

        return results


