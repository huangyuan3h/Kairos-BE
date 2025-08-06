"""
Unit tests for calculator module.
"""

import pytest
from core.calculator import add, multiply


class TestCalculator:
    """Test cases for calculator functions."""
    
    def test_add_integers(self):
        """Test adding two integers."""
        assert add(2, 3) == 5
        assert add(-1, 1) == 0
        assert add(0, 0) == 0
    
    def test_add_floats(self):
        """Test adding two floats."""
        assert add(2.5, 3.5) == 6.0
        assert add(-1.5, 1.5) == 0.0
        assert add(0.1, 0.2) == pytest.approx(0.3)
    
    def test_add_mixed_types(self):
        """Test adding integer and float."""
        assert add(2, 3.5) == 5.5
        assert add(3.5, 2) == 5.5
    
    def test_add_invalid_inputs(self):
        """Test that invalid inputs raise TypeError."""
        with pytest.raises(TypeError):
            add("2", 3)
        
        with pytest.raises(TypeError):
            add(2, "3")
        
        with pytest.raises(TypeError):
            add("hello", "world")
    
    def test_multiply_integers(self):
        """Test multiplying two integers."""
        assert multiply(2, 3) == 6
        assert multiply(-2, 3) == -6
        assert multiply(0, 5) == 0
    
    def test_multiply_floats(self):
        """Test multiplying two floats."""
        assert multiply(2.5, 3.0) == 7.5
        assert multiply(-1.5, 2.0) == -3.0
        assert multiply(0.5, 0.5) == 0.25
    
    def test_multiply_mixed_types(self):
        """Test multiplying integer and float."""
        assert multiply(2, 3.5) == 7.0
        assert multiply(3.5, 2) == 7.0
    
    def test_multiply_invalid_inputs(self):
        """Test that invalid inputs raise TypeError."""
        with pytest.raises(TypeError):
            multiply("2", 3)
        
        with pytest.raises(TypeError):
            multiply(2, "3")
        
        with pytest.raises(TypeError):
            multiply("hello", "world")


def test_add_function_directly():
    """Test add function directly (not in class)."""
    assert add(10, 20) == 30


def test_multiply_function_directly():
    """Test multiply function directly (not in class)."""
    assert multiply(4, 5) == 20 