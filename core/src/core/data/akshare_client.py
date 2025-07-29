import logging
from typing import List, Dict, Any
import pandas as pd
import akshare as ak
from ..models.securities import Security

logger = logging.getLogger(__name__)

class AkshareClient:
    """
    Client for interacting with akshare API to fetch securities data.
    Handles all akshare-related operations and data transformations.
    """
    
    def __init__(self):
        """
        Initialize the akshare client.
        """
        self._supported_functions = {
            "stock_zh_a_spot_em": self._fetch_chinese_a_shares,
            # Add more akshare functions as needed
            # "stock_us_spot_em": self._fetch_us_stocks,
            # "fund_etf_spot_em": self._fetch_etfs,
        }
    
    def fetch_securities(self, func_name: str) -> List[Security]:
        """
        Fetch securities data using the specified akshare function.
        
        Args:
            func_name: Name of the akshare function to call
            
        Returns:
            List of Security objects
            
        Raises:
            ValueError: If the function is not supported
        """
        if func_name not in self._supported_functions:
            raise ValueError(f"Unsupported akshare function: {func_name}")
        
        return self._supported_functions[func_name]()
    
    def get_supported_functions(self) -> List[str]:
        """
        Get list of supported akshare functions.
        
        Returns:
            List of supported function names
        """
        return list(self._supported_functions.keys())
    
    def _fetch_chinese_a_shares(self) -> List[Security]:
        """
        Fetch Chinese A-shares data using akshare.
        
        Returns:
            List of Security objects representing A-shares
        """
        try:
            logger.info("Fetching Chinese A-shares data from akshare")
            
            # Fetch A-shares data using akshare
            df = ak.stock_zh_a_spot_em()
            
            # Transform DataFrame to Security objects
            securities = []
            for _, row in df.iterrows():
                try:
                    security = Security(
                        symbol=row.get("代码", ""),
                        name=row.get("名称", ""),
                        market="CN_A",
                        security_type="STOCK",
                        current_price=self._safe_float(row.get("最新价")),
                        change_percent=self._safe_float(row.get("涨跌幅")),
                        volume=self._safe_float(row.get("成交量")),
                        turnover=self._safe_float(row.get("成交额")),
                        market_cap=self._safe_float(row.get("总市值")),
                        pe_ratio=self._safe_float(row.get("市盈率")),
                        pb_ratio=self._safe_float(row.get("市净率")),
                        data_source="akshare"
                    )
                    securities.append(security)
                except Exception as e:
                    logger.warning(f"Error processing row {row.get('代码', 'unknown')}: {str(e)}")
                    continue
            
            logger.info(f"Successfully fetched {len(securities)} A-shares from akshare")
            return securities
            
        except Exception as e:
            logger.error(f"Error fetching A-shares data: {str(e)}")
            raise
    
    def _safe_float(self, value) -> float:
        """
        Safely convert value to float, returning 0.0 if conversion fails.
        
        Args:
            value: Value to convert
            
        Returns:
            Float value or 0.0 if conversion fails
        """
        if value is None or value == "":
            return 0.0
        
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
    
    # Future methods for other markets
    # def _fetch_us_stocks(self) -> List[Security]:
    #     """Fetch US stocks data using akshare."""
    #     pass
    #
    # def _fetch_etfs(self) -> List[Security]:
    #     """Fetch ETF data using akshare."""
    #     pass 