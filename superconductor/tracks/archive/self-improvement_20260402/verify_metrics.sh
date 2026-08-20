#!/bin/bash
# Test script to verify the existence and content of superconductor/metrics.md

FILE="superconductor/metrics.md"

if [ ! -f "$FILE" ]; then
    echo "Error: $FILE does not exist."
    exit 1
fi

echo "Verifying $FILE content..."

# Check for required sections
grep -q "# Internal Performance and Error Metrics" "$FILE" || { echo "Missing header: # Internal Performance and Error Metrics"; exit 1; }
grep -q "## Harness Error Metrics" "$FILE" || { echo "Missing section: ## Harness Error Metrics"; exit 1; }
grep -q "## Extension Improvement Metrics" "$FILE" || { echo "Missing section: ## Extension Improvement Metrics"; exit 1; }
grep -q "## Application Improvement Metrics" "$FILE" || { echo "Missing section: ## Application Improvement Metrics"; exit 1; }

echo "All metrics defined correctly."
exit 0
