"""
Unit tests for market sync functionality.
"""

import unittest
from unittest.mock import Mock, patch
from core.services.market_sync_service import MarketSyncService
from core.config.settings import Settings
from core.models.securities import Security

class TestMarketSyncService(unittest.TestCase):
    """Test cases for MarketSyncService."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_table = Mock()
        self.service = MarketSyncService(self.mock_table)
    
    def test_sync_chinese_a_shares_success(self):
        """Test successful Chinese A-shares sync."""
        # Mock securities data
        mock_securities = [
            Security(
                symbol="600519.SH",
                name="贵州茅台",
                market="CN_A",
                security_type="STOCK",
                current_price=1800.0,
                data_source="akshare"
            ),
            Security(
                symbol="000001.SZ", 
                name="平安银行",
                market="CN_A",
                security_type="STOCK",
                current_price=12.5,
                data_source="akshare"
            )
        ]
        
        # Mock akshare client
        with patch.object(self.service.akshare_client, 'fetch_securities') as mock_fetch:
            mock_fetch.return_value = mock_securities
            
            # Mock repository
            with patch.object(self.service.repository, 'batch_store_securities') as mock_store:
                mock_store.return_value = 2
                
                # Execute sync
                result = self.service.sync_chinese_a_shares()
                
                # Assertions
                self.assertTrue(result["success"])
                self.assertEqual(result["market"], "CN_A")
                self.assertEqual(result["synced_count"], 2)
                
                # Verify calls
                mock_fetch.assert_called_once_with("stock_zh_a_spot_em")
                mock_store.assert_called_once_with(mock_securities)
    
    def test_sync_chinese_a_shares_failure(self):
        """Test Chinese A-shares sync failure."""
        # Mock akshare client to raise exception
        with patch.object(self.service.akshare_client, 'fetch_securities') as mock_fetch:
            mock_fetch.side_effect = Exception("Network error")
            
            # Execute sync
            result = self.service.sync_chinese_a_shares()
            
            # Assertions
            self.assertFalse(result["success"])
            self.assertEqual(result["market"], "CN_A")
            self.assertEqual(result["synced_count"], 0)
            self.assertIn("error", result)
    
    def test_get_supported_markets(self):
        """Test getting supported markets."""
        markets = Settings.get_supported_markets()
        self.assertIn("CN_A", markets)
    
    def test_get_market_config(self):
        """Test getting market configuration."""
        config = Settings.get_market_config("CN_A")
        self.assertEqual(config["name"], "Chinese A-Shares")
        self.assertEqual(config["data_source"], "akshare")
        self.assertEqual(config["akshare_func"], "stock_zh_a_spot_em")
        self.assertEqual(config["security_type"], "STOCK")

if __name__ == "__main__":
    unittest.main() 