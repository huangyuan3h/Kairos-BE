from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import boto3  # type: ignore[import]


@dataclass(frozen=True)
class DynamoConfig:
    """Immutable configuration for DynamoDB access.

    Attributes
    ----------
    table_name: str
        The DynamoDB table name to use.
    region: Optional[str]
        The AWS region; if omitted, will fall back to environment or SDK defaults.
    """

    table_name: str
    region: Optional[str] = None


def _resolve_region(explicit_region: Optional[str]) -> Optional[str]:
    # Prefer explicit, then env, otherwise let boto3 resolve (eg, IAM role default)
    return explicit_region or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")


def get_dynamo_table(config: DynamoConfig):
    """Create and return a DynamoDB Table resource.

    Notes
    -----
    The AWS Lambda Python runtime ships with boto3. In local environments,
    ensure AWS credentials and region are configured or passed via env.
    """
    region = _resolve_region(config.region)
    resource = boto3.resource("dynamodb", region_name=region)
    return resource.Table(config.table_name)
