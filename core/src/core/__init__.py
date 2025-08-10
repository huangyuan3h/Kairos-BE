from core.db import get_user
from core.calculator import add, multiply


def hello() -> str:
    return "Hello from core!"


__all__ = ["get_user", "hello", "add", "multiply"]