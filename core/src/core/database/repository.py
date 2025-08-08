from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from boto3.dynamodb.conditions import Key  # type: ignore[import]
from botocore.exceptions import BotoCoreError, ClientError  # type: ignore[import]

from .exceptions import RepositoryError


class DynamoRepository:
    """High-level repository encapsulating DynamoDB CRUD and queries.

    This repository assumes the following table schema and GSIs exist:
    - Primary:  pk (HASH), sk (RANGE)
    - GSI1 bySymbol:       gsi1pk (HASH), gsi1sk (RANGE)
    - GSI2 byMarketStatus: gsi2pk (HASH), gsi2sk (RANGE)

    The repository exposes minimal CRUD plus targeted query helpers
    to satisfy common access patterns efficiently.
    """

    def __init__(self, table) -> None:
        self._table = table

    # ---------- CRUD ----------
    def put_item(self, item: Dict[str, Any]) -> None:
        try:
            self._table.put_item(Item=item)
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to put item: {exc}") from exc

    def get_item(self, pk: str, sk: str) -> Optional[Dict[str, Any]]:
        try:
            res = self._table.get_item(Key={"pk": pk, "sk": sk})
            return res.get("Item")
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to get item: {exc}") from exc

    def delete_item(self, pk: str, sk: str) -> None:
        try:
            self._table.delete_item(Key={"pk": pk, "sk": sk})
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to delete item: {exc}") from exc

    def update_item(
        self,
        pk: str,
        sk: str,
        update_expression: str,
        expression_attribute_values: Dict[str, Any],
        condition_expression: Optional[str] = None,
        expression_attribute_names: Optional[Dict[str, str]] = None,
        return_values: str = "ALL_NEW",
    ) -> Dict[str, Any]:
        try:
            params: Dict[str, Any] = {
                "Key": {"pk": pk, "sk": sk},
                "UpdateExpression": update_expression,
                "ExpressionAttributeValues": expression_attribute_values,
                "ReturnValues": return_values,
            }
            if condition_expression is not None:
                params["ConditionExpression"] = condition_expression
            if expression_attribute_names is not None:
                params["ExpressionAttributeNames"] = expression_attribute_names
            res = self._table.update_item(**params)
            return res
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to update item: {exc}") from exc

    # ---------- Query helpers ----------
    def query_by_symbol(
        self,
        symbol_pk: str,
        begins_with_prefix: Optional[str] = None,
        limit: Optional[int] = None,
        scan_forward: bool = True,
    ) -> List[Dict[str, Any]]:
        """Query GSI1 by symbol.

        Parameters
        ----------
        symbol_pk: str
            The prebuilt GSI1 PK (eg, SYMBOL#600519).
        begins_with_prefix: Optional[str]
            If provided, applies begins_with to gsi1sk (eg, ENTITY#PROFILE).
        limit: Optional[int]
            Max items to return.
        scan_forward: bool
            Sort order on the range key.
        """
        key_condition = Key("gsi1pk").eq(symbol_pk)
        if begins_with_prefix:
            key_condition &= Key("gsi1sk").begins_with(begins_with_prefix)

        params: Dict[str, Any] = {
            "IndexName": "bySymbol",
            "KeyConditionExpression": key_condition,
            "ScanIndexForward": scan_forward,
        }
        if limit:
            params["Limit"] = limit

        try:
            items: List[Dict[str, Any]] = []
            last_evaluated_key: Optional[Dict[str, Any]] = None
            while True:
                if last_evaluated_key:
                    params["ExclusiveStartKey"] = last_evaluated_key
                page = self._table.query(**params)
                items.extend(page.get("Items", []))
                last_evaluated_key = page.get("LastEvaluatedKey")
                if not last_evaluated_key or (limit and len(items) >= limit):
                    break
            if limit:
                return items[:limit]
            return items
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to query by symbol: {exc}") from exc

    def query_by_market_status(
        self,
        market_status_pk: str,
        begins_with_prefix: Optional[str] = None,
        limit: Optional[int] = None,
        scan_forward: bool = True,
    ) -> List[Dict[str, Any]]:
        """Query GSI2 by market + status.

        The PK should be prebuilt, eg, MARKET#CN#STATUS#ACTIVE.
        """
        key_condition = Key("gsi2pk").eq(market_status_pk)
        if begins_with_prefix:
            key_condition &= Key("gsi2sk").begins_with(begins_with_prefix)

        params: Dict[str, Any] = {
            "IndexName": "byMarketStatus",
            "KeyConditionExpression": key_condition,
            "ScanIndexForward": scan_forward,
        }
        if limit:
            params["Limit"] = limit

        try:
            items: List[Dict[str, Any]] = []
            last_evaluated_key: Optional[Dict[str, Any]] = None
            while True:
                if last_evaluated_key:
                    params["ExclusiveStartKey"] = last_evaluated_key
                page = self._table.query(**params)
                items.extend(page.get("Items", []))
                last_evaluated_key = page.get("LastEvaluatedKey")
                if not last_evaluated_key or (limit and len(items) >= limit):
                    break
            if limit:
                return items[:limit]
            return items
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to query by market/status: {exc}") from exc

    # ---------- Batch operations ----------
    def batch_put(self, items: Iterable[Dict[str, Any]]) -> None:
        """Put multiple items efficiently using batch_writer."""
        try:
            with self._table.batch_writer(overwrite_by_pkeys=["pk", "sk"]) as writer:
                for item in items:
                    writer.put_item(Item=item)
        except (BotoCoreError, ClientError) as exc:
            raise RepositoryError(f"Failed to batch put items: {exc}") from exc
