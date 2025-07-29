#!/usr/bin/env python3
"""
Simple debug script for VS Code debugging.
This script can be run directly in VS Code with breakpoints.
"""

import boto3
from core.services.market_sync_service import MarketSyncService
from core.config.settings import Settings

def debug_sync():
    """
    Debug function for testing sync functionality.
    Set breakpoints in this function or in the core modules.
    """
    print("Starting debug session...")
    
    # Create mock DynamoDB table (for local testing)
    mock_table = None  # You can replace this with actual DynamoDB table
    
    # Create service
    service = MarketSyncService(mock_table)
    
    # Test getting supported markets
    markets = Settings.get_supported_markets()
    print(f"Supported markets: {markets}")
    
    # Test getting market config
    cn_config = Settings.get_market_config("CN_A")
    print(f"CN_A config: {cn_config}")
    
    # Test sync (this will fail without real DynamoDB, but you can set breakpoints)
    try:
        result = service.sync_chinese_a_shares()
        print(f"Sync result: {result}")
    except Exception as e:
        print(f"Sync failed (expected without DynamoDB): {e}")
    
    print("Debug session completed!")

if __name__ == "__main__":
    debug_sync() 