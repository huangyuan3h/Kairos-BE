#!/usr/bin/env python3
"""
Simple test script to verify development environment configuration.
"""

from core.calculator import add, multiply
from core.data_collector.stock.spot_data_collector import get_a_share_spot_data


def main():
    """Main function to test calculator functions."""
    print("Testing calculator functions...")
    
    df = get_a_share_spot_data()
    print(df)
    
    print("All tests passed!")


if __name__ == "__main__":
    main() 