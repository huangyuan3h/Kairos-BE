# functions/src/functions/handler.py
import json
import sys
# Try importing akshare to ensure it's included in the deployment package
try:
    import akshare as ak
    akshare_available = True
    ak_version = getattr(ak, '__version__', 'unknown') # Get version if possible
except ImportError:
    akshare_available = False
    ak_version = 'not found'

def main(event, context):
    """
    A simple Lambda handler function.
    """
    print("Lambda function invoked!")
    print(f"Event received: {json.dumps(event)}")
    print(f"Python version: {sys.version}")
    print(f"Akshare available: {akshare_available}, Version: {ak_version}")

    body_message = f"Hello from Lambda! Akshare available: {akshare_available} (Version: {ak_version})"

    response = {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "message": body_message,
            "event": event # Echo back the event for debugging
        })
    }

    return response 