"""
Simple Python Lambda function for testing scheduled tasks
"""

import json
import os
import boto3
from datetime import datetime, timezone
from typing import Dict, Any
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def simple_task_1(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simple task: Log current timestamp
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    logger.info(f"Task executed at: {timestamp}")
    
    return {
        'task_name': 'simple_task_1',
        'timestamp': timestamp,
        'status': 'completed',
        'message': 'Task executed successfully'
    }

def save_task_result(task_name: str, result: Dict[str, Any]):
    """
    Save task execution result to DynamoDB
    """
    try:
        # Initialize AWS clients
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(os.environ['MARKET_DATA_TABLE'])
        
        timestamp = datetime.now(timezone.utc).isoformat()
        
        item = {
            'pk': f"task#{task_name}",
            'sk': timestamp,
            'data': json.dumps(result),
            'source': 'python_crawler',
            'updated_at': timestamp,
            'ttl': int(datetime.now(timezone.utc).timestamp()) + (7 * 24 * 3600)  # 7 days TTL
        }
        
        table.put_item(Item=item)
        logger.info(f"Saved task result for {task_name} to DynamoDB")
        
    except Exception as e:
        logger.error(f"Error saving task result: {str(e)}")
        raise

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler function
    """
    try:
        # Handle different event sources (API Gateway/Function URL vs. EventBridge)
        if isinstance(event.get('body'), str):
            payload = json.loads(event['body'])
        else:
            payload = event

        logger.info(f"Received payload: {json.dumps(payload)}")
        
        # Extract task configuration from event
        task_name = payload.get('taskName', 'unknown')
        task_type = payload.get('taskType', 'simple_task_1')
        
        logger.info(f"Executing task: {task_name} (type: {task_type})")
        
        # Execute task
        result = simple_task_1(payload)
        
        # Save task result
        save_task_result(task_name, result)
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Task {task_name} executed successfully',
                'taskName': task_name,
                'taskType': task_type,
                'result': result
            })
        }
        
    except Exception as e:
        logger.error(f"Error in handler: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
