import os
import boto3
import time
from core.services.market_sync_service import MarketSyncService
from core.config.settings import Settings

def sync_securities_list(event, context):
    """
    Lambda handler for syncing securities list.
    This function syncs all supported markets sequentially.
    """
    try:
        # Get DynamoDB table name from SST environment variable
        table_name = os.environ.get("SST_Table_tableName_Securities", Settings.DYNAMODB_TABLE_NAME)
        
        print(f"Starting securities sync for table: {table_name}")
        
        # Initialize DynamoDB connection
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(table_name)
        
        # Create market sync service
        sync_service = MarketSyncService(table)
        
        # Sync all markets
        result = sync_service.sync_all_markets()
        
        print(f"Sync completed. Total synced: {result['total_synced']}")
        
        return {
            "statusCode": 200,
            "body": {
                "message": "Securities sync completed",
                "result": result,
                "timestamp": int(time.time())
            }
        }
        
    except Exception as e:
        print(f"Error during securities sync: {str(e)}")
        return {
            "statusCode": 500,
            "body": {
                "message": "Securities sync failed",
                "error": str(e),
                "timestamp": int(time.time())
            }
        } 