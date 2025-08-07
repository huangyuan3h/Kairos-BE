"""
A-share real-time spot data collector.

This module provides functionality for collecting A-share real-time market data
including current prices, volume, change percentages, and other market indicators.
"""

import logging
from typing import Optional

import akshare as ak
import pandas as pd

# Configure logging
logger = logging.getLogger(__name__)

# Column name mapping from Chinese to English
COLUMN_MAPPING = {
    '序号': 'index',
    '代码': 'symbol',
    '名称': 'name',
    '最新价': 'current_price',
    '涨跌幅': 'change_percent',
    '涨跌额': 'change_amount',
    '成交量': 'volume',
    '成交额': 'turnover',
    '振幅': 'amplitude',
    '最高': 'high',
    '最低': 'low',
    '今开': 'open',
    '昨收': 'prev_close',
    '量比': 'volume_ratio',
    '换手率': 'turnover_rate',
    '市盈率-动态': 'pe_ratio',
    '市净率': 'pb_ratio',
    '总市值': 'market_cap',
    '流通市值': 'circulating_market_cap',
    '涨速': 'price_speed',
    '5分钟涨跌': 'change_5min',
    '60日涨跌幅': 'change_60d',
    '年初至今涨跌幅': 'change_ytd'
}


def _standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardize column names from Chinese to English.
    
    Args:
        df: DataFrame with Chinese column names
        
    Returns:
        DataFrame with standardized English column names
    """
    # Create a mapping for columns that exist in the DataFrame
    existing_mapping = {col: COLUMN_MAPPING[col] for col in df.columns if col in COLUMN_MAPPING}
    
    if existing_mapping:
        df = df.rename(columns=existing_mapping)
        logger.info(f"Standardized {len(existing_mapping)} column names")
    
    return df


def get_a_share_spot_data() -> Optional[pd.DataFrame]:
    """
    Get A-share real-time spot data.
    
    This function fetches real-time market data for all A-share stocks
    including current price, volume, change percentage, etc.
    
    Returns:
        pd.DataFrame: DataFrame containing A-share spot data with standardized English columns
        
    Raises:
        Exception: If data fetching fails
    """
    try:
        logger.info("Fetching A-share real-time spot data...")
        
        # Fetch A-share real-time data using AKShare
        df = ak.stock_zh_a_spot_em()
        
        # Standardize column names
        df = _standardize_columns(df)
        
        logger.info(f"Successfully fetched A-share data: {len(df)} records")
        
        return df
        
    except Exception as e:
        logger.error(f"Failed to fetch A-share spot data: {str(e)}")
        raise


def get_a_share_basic_info() -> Optional[pd.DataFrame]:
    """
    Get A-share basic information.
    
    This function fetches basic information for all A-share stocks
    including stock code, name, current price, and change info.
    
    Returns:
        pd.DataFrame: DataFrame containing A-share basic information
        
    Raises:
        Exception: If data fetching fails
    """
    try:
        logger.info("Fetching A-share basic information...")
        
        # Fetch A-share basic information using AKShare
        df = ak.stock_zh_a_spot_em()
        
        # Select only basic columns for basic info
        basic_columns = ['代码', '名称', '最新价', '涨跌幅', '涨跌额']
        df_basic = df[basic_columns].copy()
        
        # Standardize column names
        df_basic = _standardize_columns(df_basic)
        
        logger.info(f"Successfully fetched A-share basic info: {len(df_basic)} records")
        
        return df_basic
        
    except Exception as e:
        logger.error(f"Failed to fetch A-share basic info: {str(e)}")
        raise


if __name__ == "__main__":
    # Test the functions
    import logging
    
    # Configure logging for testing
    logging.basicConfig(level=logging.INFO)
    
    print("Testing A-share spot data collection...")
    
    # Test basic info function
    try:
        df_basic = get_a_share_basic_info()
        if df_basic is not None:
            print(f"Basic info shape: {df_basic.shape}")
            print("Columns:", list(df_basic.columns))
            print("First 5 records:")
            print(df_basic.head())
        else:
            print("Failed to get basic info")
    except Exception as e:
        print(f"Error testing basic info: {e}")
    
    # Test full spot data function
    try:
        df_full = get_a_share_spot_data()
        if df_full is not None:
            print(f"Full data shape: {df_full.shape}")
            print("Columns:", list(df_full.columns))
            print("First 3 records:")
            print(df_full.head(3))
        else:
            print("Failed to get full data")
    except Exception as e:
        print(f"Error testing full data: {e}")
