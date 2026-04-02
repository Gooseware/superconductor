#!/bin/bash
# Test script to verify tool-call validation logic

VALIDATOR="superconductor/validate_tool.sh"

if [ ! -f "$VALIDATOR" ]; then
    echo "Error: $VALIDATOR does not exist."
    exit 1
fi

chmod +x "$VALIDATOR"

echo "Running validation tests..."

# Test 1: Valid tool and path
$VALIDATOR "write_file" "superconductor/test.md" || { echo "Test 1 failed: Valid tool/path rejected"; exit 1; }

# Test 2: Hallucinated tool
$VALIDATOR "exit_plan_mode" "superconductor/test.md" && { echo "Test 2 failed: Hallucinated tool accepted"; exit 1; }

# Test 3: Path outside superconductor/ (Plan Mode violation)
$VALIDATOR "write_file" "README.md" && { echo "Test 3 failed: Unsafe path accepted"; exit 1; }

# Test 4: Absolute path (Plan Mode violation)
$VALIDATOR "write_file" "/home/gooseware/README.md" && { echo "Test 4 failed: Absolute path accepted"; exit 1; }

echo "All validation tests passed."
exit 0
