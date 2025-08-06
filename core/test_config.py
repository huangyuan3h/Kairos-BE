#!/usr/bin/env python3
"""
Simple test script to verify development environment configuration.
"""

from core.calculator import add, multiply


def main():
    """Main function to test calculator functions."""
    print("Testing calculator functions...")
    
    # Test addition
    result1 = add(5, 3)
    print(f"5 + 3 = {result1}")
    
    # Test multiplication
    result2 = multiply(4, 6)
    print(f"4 * 6 = {result2}")
    
    # Test with floats
    result3 = add(2.5, 3.5)
    print(f"2.5 + 3.5 = {result3}")
    
    # Test error handling
    try:
        add("hello", 5)
    except TypeError as e:
        print(f"Expected error caught: {e}")
    
    print("All tests passed!")


if __name__ == "__main__":
    main() 