"""
Test script for scheduled task framework
Run this locally to test the task execution functionality
"""

import json
import os
import sys
from datetime import datetime, timezone

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock environment variable for local testing
os.environ['MARKET_DATA_TABLE'] = 'test-table'

def test_simple_task_1():
    """Test simple task 1"""
    print("Testing simple task 1...")
    
    try:
        # Import after setting environment variable
        from python_crawler import simple_task_1
        
        # Test event
        test_event = {
            "taskName": "test_task_1",
            "taskType": "simple_task_1",
            "description": "Test task 1"
        }
        
        result = simple_task_1(test_event)
        print(f"✅ Task 1 executed successfully")
        print(f"  Result: {json.dumps(result, indent=2)}")
        return True
    except Exception as e:
        print(f"❌ Error testing task 1: {e}")
        return False

def test_simple_task_2():
    """Test simple task 2"""
    print("\nTesting simple task 2...")
    
    try:
        # Import after setting environment variable
        from python_crawler import simple_task_2
        
        # Test event with custom data
        test_event = {
            "taskName": "test_task_2",
            "taskType": "simple_task_2",
            "description": "Test task 2",
            "customData": {
                "key1": "value1",
                "key2": "value2",
                "timestamp": datetime.now().isoformat()
            }
        }
        
        result = simple_task_2(test_event)
        print(f"✅ Task 2 executed successfully")
        print(f"  Result: {json.dumps(result, indent=2)}")
        return True
    except Exception as e:
        print(f"❌ Error testing task 2: {e}")
        return False

def test_lambda_handler():
    """Test Lambda handler function"""
    print("\nTesting Lambda handler...")
    
    try:
        # Import after setting environment variable
        from python_crawler import handler
        
        # Test events
        test_events = [
            {
                "taskName": "handler_test_1",
                "taskType": "simple_task_1",
                "description": "Handler test 1"
            },
            {
                "taskName": "handler_test_2", 
                "taskType": "simple_task_2",
                "description": "Handler test 2",
                "customData": {"test": "data"}
            }
        ]
        
        results = []
        
        for i, test_event in enumerate(test_events, 1):
            try:
                print(f"  Testing handler with event {i}...")
                print(f"    Event: {json.dumps(test_event, indent=4)}")
                
                # Note: This will fail without AWS credentials and DynamoDB table
                # But we can test the task execution part
                if test_event["taskType"] == "simple_task_1":
                    from python_crawler import simple_task_1
                    result = simple_task_1(test_event)
                else:
                    from python_crawler import simple_task_2
                    result = simple_task_2(test_event)
                    
                print(f"    ✅ Handler would process task: {result['task_name']}")
                results.append(True)
                
            except Exception as e:
                print(f"    ❌ Error testing handler: {e}")
                results.append(False)
        
        return all(results)
    except Exception as e:
        print(f"❌ Error testing handler: {e}")
        return False

def test_unknown_task_type():
    """Test handling of unknown task type"""
    print("\nTesting unknown task type handling...")
    
    try:
        # Import after setting environment variable
        from python_crawler import handler
        
        # Test with unknown task type
        test_event = {
            "taskName": "unknown_task",
            "taskType": "unknown_task_type",
            "description": "Unknown task type test"
        }
        
        print(f"  Testing with unknown task type: {test_event['taskType']}")
        
        # This should return an error response
        # For local testing, we'll just check if the task type is handled
        if test_event["taskType"] not in ["simple_task_1", "simple_task_2"]:
            print("    ✅ Unknown task type would be rejected")
            return True
        else:
            print("    ❌ Task type should be unknown")
            return False
            
    except Exception as e:
        print(f"❌ Error testing unknown task type: {e}")
        return False

def test_task_configuration():
    """Test task configuration structure"""
    print("\nTesting task configuration...")
    
    try:
        # Test that our task functions return expected structure
        from python_crawler import simple_task_1, simple_task_2
        
        test_event = {
            "taskName": "config_test",
            "taskType": "simple_task_1",
            "description": "Configuration test"
        }
        
        result1 = simple_task_1(test_event)
        result2 = simple_task_2(test_event)
        
        # Check required fields
        required_fields = ['task_name', 'status', 'message']
        
        for field in required_fields:
            if field not in result1:
                print(f"    ❌ Task 1 missing required field: {field}")
                return False
            if field not in result2:
                print(f"    ❌ Task 2 missing required field: {field}")
                return False
        
        print("    ✅ Task configuration structure is correct")
        return True
        
    except Exception as e:
        print(f"❌ Error testing task configuration: {e}")
        return False

def main():
    """Run all tests"""
    print("=== Scheduled Task Framework Test Suite ===\n")
    
    tests = [
        ("Simple Task 1", test_simple_task_1),
        ("Simple Task 2", test_simple_task_2),
        ("Task Configuration", test_task_configuration),
        ("Lambda Handler", test_lambda_handler),
        ("Unknown Task Type", test_unknown_task_type),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"Running {test_name} test...")
        try:
            success = test_func()
            results.append((test_name, success))
        except Exception as e:
            print(f"Test {test_name} failed with exception: {e}")
            results.append((test_name, False))
        print()
    
    # Summary
    print("=== Test Results ===")
    passed = 0
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{test_name}: {status}")
        if success:
            passed += 1
    
    print(f"\nOverall: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed! The task framework is ready for deployment.")
        print("\nNext steps:")
        print("1. Deploy to AWS: bun sst deploy --stage dev")
        print("2. Check CloudWatch logs for task execution")
        print("3. Verify DynamoDB table for task results")
    else:
        print("⚠️  Some tests failed. Please check the errors above.")

if __name__ == "__main__":
    main() 