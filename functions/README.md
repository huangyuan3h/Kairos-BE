# Kairos Lambda Functions

This directory contains AWS Lambda functions for Kairos data crawling and processing.

## Structure

- `python/` - Python Lambda functions
  - `sync_market_data.py` - Market data synchronization function
- `nodejs/` - Node.js Lambda functions
  - `overall_report.ts` - Overall report generation function

## Dependencies

- `core` - Core Python package (workspace dependency)
- `sst` - SST framework for deployment
