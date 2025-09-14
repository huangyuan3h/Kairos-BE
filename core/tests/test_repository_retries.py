from __future__ import annotations

from typing import Any, Dict, Iterable, List

from botocore.exceptions import ClientError  # type: ignore[import]

from core.database.repository import DynamoRepository


class _FailOnceWriter:
    def __init__(self) -> None:
        self._failed = False
        self.items: List[Dict[str, Any]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def put_item(self, Item: Dict[str, Any]) -> None:  # noqa: N803 (match boto3 signature)
        if not self._failed:
            self._failed = True
            raise ClientError({"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "throttle"}}, "PutItem")
        self.items.append(Item)


class _FakeTable:
    def __init__(self, writer: _FailOnceWriter) -> None:
        self._writer = writer

    def batch_writer(self, overwrite_by_pkeys: Iterable[str]):  # type: ignore[override]
        return self._writer


def test_batch_put_retries_on_throttle() -> None:
    writer = _FailOnceWriter()
    table = _FakeTable(writer)
    repo = DynamoRepository(table)
    items = [
        {"pk": "STOCK#X", "sk": "QUOTE#2025-09-10"},
        {"pk": "STOCK#X", "sk": "QUOTE#2025-09-11"},
    ]

    repo.batch_put(items)
    # After transient failure, items should be written
    assert len(writer.items) == 2


