"""Strategy catalogue using the core backtesting framework."""

from .fundamental import LowPEMomentumStrategy
from .technical import SwingFalconStrategy

__all__ = [
    "LowPEMomentumStrategy",
    "SwingFalconStrategy",
]
