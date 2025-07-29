import logging
from typing import Dict, Any
from ..config.settings import Settings
from ..data.securities_repository import SecuritiesRepository
from ..data.akshare_client import AkshareClient

logger = logging.getLogger(__name__)

class MarketSyncService:
    """
    Business service for syncing securities data for different markets.
    Each market has its own specific sync method.
    """
    
    def __init__(self, dynamodb_table):
        """
        Initialize the market sync service.
        
        Args:
            dynamodb_table: DynamoDB table resource
        """
        self.repository = SecuritiesRepository(dynamodb_table)
        self.akshare_client = AkshareClient()
    
    def sync_chinese_a_shares(self) -> Dict[str, Any]:
        """
        Sync Chinese A-shares data.
        
        Returns:
            Sync result dictionary
        """
        logger.info("Starting Chinese A-shares sync...")
        
        try:
            # Get market configuration
            market_config = Settings.get_market_config("CN_A")
            
            # Fetch securities data
            securities = self.akshare_client.fetch_securities(
                market_config["akshare_func"]
            )
            
            # Update market-specific attributes
            for security in securities:
                security.market = "CN_A"
                security.security_type = market_config["security_type"]
                security.data_source = market_config["data_source"]
            
            # Store in database
            synced_count = self.repository.batch_store_securities(securities)
            
            logger.info(f"Successfully synced {synced_count} Chinese A-shares")
            
            return {
                "market": "CN_A",
                "synced_count": synced_count,
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error syncing Chinese A-shares: {e}")
            return {
                "market": "CN_A",
                "synced_count": 0,
                "success": False,
                "error": str(e)
            }
    
    def sync_all_markets(self) -> Dict[str, Any]:
        """
        Sync all supported markets.
        
        Returns:
            Overall sync result
        """
        logger.info("Starting sync for all markets...")
        
        results = {}
        total_synced = 0
        
        # Sync each supported market
        for market in Settings.get_supported_markets():
            if market == "CN_A":
                result = self.sync_chinese_a_shares()
            else:
                logger.warning(f"Sync method not implemented for market: {market}")
                result = {
                    "market": market,
                    "synced_count": 0,
                    "success": False,
                    "error": "Sync method not implemented"
                }
            
            results[market] = result
            if result["success"]:
                total_synced += result["synced_count"]
        
        logger.info(f"Completed sync for all markets. Total synced: {total_synced}")
        
        return {
            "total_synced": total_synced,
            "markets": results,
            "success": all(r["success"] for r in results.values())
        }
    
    def get_sync_status(self, market: str = None) -> Dict[str, Any]:
        """
        Get sync status for a specific market or all markets.
        
        Args:
            market: Market identifier (optional)
            
        Returns:
            Sync status information
        """
        if market:
            securities = self.repository.get_securities_by_market(market)
            return {
                "market": market,
                "total_securities": len(securities),
                "last_updated": max([s.updated_at for s in securities]) if securities else None
            }
        else:
            status = {}
            for market in Settings.get_supported_markets():
                securities = self.repository.get_securities_by_market(market)
                status[market] = {
                    "total_securities": len(securities),
                    "last_updated": max([s.updated_at for s in securities]) if securities else None
                }
            return status 