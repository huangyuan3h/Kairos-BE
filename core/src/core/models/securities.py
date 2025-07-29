from dataclasses import dataclass
from typing import Dict, Any, Optional
from datetime import datetime

@dataclass
class Security:
    """
    Data model representing a security (stock, ETF, etc.)
    """
    symbol: str
    name: str
    market: str
    security_type: str
    current_price: Optional[float] = None
    change_percent: Optional[float] = None
    volume: Optional[float] = None
    turnover: Optional[float] = None
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    is_enabled: bool = True
    data_source: str = ""
    updated_at: Optional[int] = None
    
    def to_dynamodb_item(self) -> Dict[str, Any]:
        """
        Convert Security object to DynamoDB item format
        """
        item = {
            "market": self.market,
            "symbol": self.symbol,
            "name": self.name,
            "type": self.security_type,
            "isEnabled": self.is_enabled,
            "dataSource": self.data_source,
            "updatedAt": self.updated_at or int(datetime.now().timestamp()),
        }
        
        # Add optional fields if they exist
        if self.current_price is not None:
            item["currentPrice"] = self.current_price
        if self.change_percent is not None:
            item["changePercent"] = self.change_percent
        if self.volume is not None:
            item["volume"] = self.volume
        if self.turnover is not None:
            item["turnover"] = self.turnover
        if self.market_cap is not None:
            item["marketCap"] = self.market_cap
        if self.pe_ratio is not None:
            item["peRatio"] = self.pe_ratio
        if self.pb_ratio is not None:
            item["pbRatio"] = self.pb_ratio
            
        return item

@dataclass
class SecuritySyncResult:
    """
    Result of a securities synchronization operation
    """
    synced_count: int
    market: str
    data_source: str
    timestamp: int
    success: bool = True
    error_message: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert sync result to dictionary format
        """
        result = {
            "synced_count": self.synced_count,
            "market": self.market,
            "data_source": self.data_source,
            "timestamp": self.timestamp,
            "success": self.success
        }
        
        if self.error_message:
            result["error_message"] = self.error_message
            
        return result 