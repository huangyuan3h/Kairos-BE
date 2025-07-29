import time
import logging
from typing import Dict, Any, Optional
from ..models.securities import Security, SecuritySyncResult
from ..data.securities_repository import SecuritiesRepository
from ..data.akshare_client import AkshareClient

logger = logging.getLogger(__name__)

class SecuritiesSyncService:
    """
    Business logic service for syncing securities data from various sources.
    Orchestrates the data fetching and storage operations.
    """
    
    def __init__(self, dynamodb_table):
        """
        Initialize the sync service with dependencies.
        
        Args:
            dynamodb_table: DynamoDB table resource for storing securities data
        """
        self.repository = SecuritiesRepository(dynamodb_table)
        self.akshare_client = AkshareClient()
    
    def sync_securities(self, market: str, data_source: str, 
                       akshare_func: Optional[str] = None, 
                       security_type: str = "STOCK") -> Dict[str, Any]:
        """
        Main method to sync securities data based on configuration.
        
        Args:
            market: Market identifier (e.g., "CN_A", "US")
            data_source: Data source identifier (e.g., "akshare")
            akshare_func: Specific akshare function name to use
            security_type: Type of security (e.g., "STOCK", "ETF")
            
        Returns:
            Dict containing sync results and statistics
        """
        try:
            logger.info(f"Starting securities sync for market: {market}, source: {data_source}")
            
            # Fetch securities data based on data source
            if data_source == "akshare":
                if not akshare_func:
                    raise ValueError("akshare function name is required for akshare data source")
                securities = self.akshare_client.fetch_securities(akshare_func)
            else:
                raise ValueError(f"Unsupported data source: {data_source}")
            
            # Update market and security type for all securities
            for security in securities:
                security.market = market
                security.security_type = security_type
                security.data_source = data_source
            
            # Store securities in database
            synced_count = self.repository.batch_store_securities(securities)
            
            # Create sync result
            sync_result = SecuritySyncResult(
                synced_count=synced_count,
                market=market,
                data_source=data_source,
                timestamp=int(time.time())
            )
            
            logger.info(f"Successfully synced {synced_count} securities for market {market}")
            
            return sync_result.to_dict()
            
        except Exception as e:
            logger.error(f"Error during securities sync: {str(e)}")
            
            # Create error result
            error_result = SecuritySyncResult(
                synced_count=0,
                market=market,
                data_source=data_source,
                timestamp=int(time.time()),
                success=False,
                error_message=str(e)
            )
            
            raise e
    
    def get_sync_status(self, market: str) -> Dict[str, Any]:
        """
        Get synchronization status for a specific market.
        
        Args:
            market: Market identifier
            
        Returns:
            Dict containing sync status information
        """
        try:
            securities = self.repository.get_securities_by_market(market)
            
            return {
                "market": market,
                "total_securities": len(securities),
                "last_updated": max([s.updated_at for s in securities]) if securities else None,
                "enabled_securities": len([s for s in securities if s.is_enabled]),
                "disabled_securities": len([s for s in securities if not s.is_enabled])
            }
            
        except Exception as e:
            logger.error(f"Error getting sync status for market {market}: {str(e)}")
            raise
    
    def get_supported_data_sources(self) -> Dict[str, Any]:
        """
        Get information about supported data sources and functions.
        
        Returns:
            Dict containing supported data sources and their functions
        """
        return {
            "akshare": {
                "supported_functions": self.akshare_client.get_supported_functions(),
                "description": "Akshare financial data API"
            }
        } 