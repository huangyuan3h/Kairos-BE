import logging
from typing import List, Optional
from boto3.resources.base import ServiceResource
from boto3.resources.factory import ResourceCollection
from ..models.securities import Security

logger = logging.getLogger(__name__)

class SecuritiesRepository:
    """
    Repository class for DynamoDB operations on securities data.
    Handles all database interactions for securities.
    """
    
    def __init__(self, dynamodb_table):
        """
        Initialize repository with DynamoDB table reference.
        
        Args:
            dynamodb_table: DynamoDB table resource
        """
        self.table = dynamodb_table
    
    def batch_store_securities(self, securities: List[Security]) -> int:
        """
        Store multiple securities in DynamoDB using batch operations.
        
        Args:
            securities: List of Security objects to store
            
        Returns:
            Number of securities successfully stored
        """
        try:
            stored_count = 0
            
            # Use DynamoDB batch writer for efficient bulk operations
            with self.table.batch_writer() as batch:
                for security in securities:
                    item = security.to_dynamodb_item()
                    batch.put_item(Item=item)
                    stored_count += 1
                    
                    if stored_count % 100 == 0:
                        logger.info(f"Processed {stored_count} securities...")
            
            logger.info(f"Successfully stored {stored_count} securities in DynamoDB")
            return stored_count
            
        except Exception as e:
            logger.error(f"Error storing securities data: {str(e)}")
            raise
    
    def get_securities_by_market(self, market: str) -> List[Security]:
        """
        Retrieve all securities for a specific market.
        
        Args:
            market: Market identifier
            
        Returns:
            List of Security objects
        """
        try:
            response = self.table.query(
                KeyConditionExpression="market = :market",
                ExpressionAttributeValues={":market": market}
            )
            
            securities = []
            for item in response.get("Items", []):
                security = Security(
                    symbol=item["symbol"],
                    name=item["name"],
                    market=item["market"],
                    security_type=item["type"],
                    current_price=item.get("currentPrice"),
                    change_percent=item.get("changePercent"),
                    volume=item.get("volume"),
                    turnover=item.get("turnover"),
                    market_cap=item.get("marketCap"),
                    pe_ratio=item.get("peRatio"),
                    pb_ratio=item.get("pbRatio"),
                    is_enabled=item.get("isEnabled", True),
                    data_source=item.get("dataSource", ""),
                    updated_at=item.get("updatedAt")
                )
                securities.append(security)
            
            return securities
            
        except Exception as e:
            logger.error(f"Error retrieving securities for market {market}: {str(e)}")
            raise
    
    def get_security(self, market: str, symbol: str) -> Optional[Security]:
        """
        Retrieve a specific security by market and symbol.
        
        Args:
            market: Market identifier
            symbol: Security symbol
            
        Returns:
            Security object or None if not found
        """
        try:
            response = self.table.get_item(
                Key={
                    "market": market,
                    "symbol": symbol
                }
            )
            
            item = response.get("Item")
            if not item:
                return None
            
            return Security(
                symbol=item["symbol"],
                name=item["name"],
                market=item["market"],
                security_type=item["type"],
                current_price=item.get("currentPrice"),
                change_percent=item.get("changePercent"),
                volume=item.get("volume"),
                turnover=item.get("turnover"),
                market_cap=item.get("marketCap"),
                pe_ratio=item.get("peRatio"),
                pb_ratio=item.get("pbRatio"),
                is_enabled=item.get("isEnabled", True),
                data_source=item.get("dataSource", ""),
                updated_at=item.get("updatedAt")
            )
            
        except Exception as e:
            logger.error(f"Error retrieving security {market}:{symbol}: {str(e)}")
            raise
    
    def update_security(self, security: Security) -> bool:
        """
        Update an existing security in the database.
        
        Args:
            security: Security object to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            item = security.to_dynamodb_item()
            self.table.put_item(Item=item)
            return True
            
        except Exception as e:
            logger.error(f"Error updating security {security.symbol}: {str(e)}")
            return False 