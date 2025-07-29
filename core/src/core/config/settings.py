import os
from typing import Dict, Any

class Settings:
    """
    Centralized configuration settings for the application.
    """
    
    # DynamoDB Configuration
    DYNAMODB_TABLE_NAME = "Securities"
    
    # Market Configuration
    MARKETS = {
        "CN_A": {
            "name": "Chinese A-Shares",
            "data_source": "akshare",
            "akshare_func": "stock_zh_a_spot_em",
            "security_type": "STOCK"
        },
        # Future markets can be added here
        # "US": {
        #     "name": "US Stocks",
        #     "data_source": "akshare", 
        #     "akshare_func": "stock_us_spot_em",
        #     "security_type": "STOCK"
        # }
    }
    
    @classmethod
    def get_market_config(cls, market: str) -> Dict[str, Any]:
        """
        Get configuration for a specific market.
        
        Args:
            market: Market identifier
            
        Returns:
            Market configuration dictionary
        """
        if market not in cls.MARKETS:
            raise ValueError(f"Unsupported market: {market}")
        
        return cls.MARKETS[market]
    
    @classmethod
    def get_supported_markets(cls) -> list:
        """
        Get list of supported markets.
        
        Returns:
            List of supported market identifiers
        """
        return list(cls.MARKETS.keys()) 