#!/bin/bash
# Test script for log analysis logic

ANALYZER="superconductor/analyze_logs.sh"
MOCK_LOGS="superconductor/tracks/self-improvement_20260402/mock_logs.json"

if [ ! -f "$ANALYZER" ]; then
    echo "Error: $ANALYZER does not exist."
    exit 1
fi

chmod +x "$ANALYZER"

echo "Creating mock logs..."
cat <<EOF > "$MOCK_LOGS"
[
  {
    "type": "tool_call",
    "tool": "write_file",
    "args": "README.md",
    "status": "error",
    "error": "Policy denial"
  },
  {
    "type": "tool_call",
    "tool": "read_file",
    "args": "superconductor/product.md",
    "status": "success"
  },
  {
    "type": "tool_call",
    "tool": "read_file",
    "args": "superconductor/product.md",
    "status": "success"
  },
  {
    "type": "tool_call",
    "tool": "exit_plan_mode",
    "args": "",
    "status": "error",
    "error": "Tool not found"
  }
]
EOF

echo "Running log analysis tests..."

# Test 1: Detect policy denials
$ANALYZER "$MOCK_LOGS" | grep -q "Policy denial" || { echo "Test 1 failed: Failed to detect policy denial"; exit 1; }

# Test 2: Detect redundant tool calls
$ANALYZER "$MOCK_LOGS" | grep -q "Redundant call: read_file" || { echo "Test 2 failed: Failed to detect redundant call"; exit 1; }

# Test 3: Detect tool hallucinations
$ANALYZER "$MOCK_LOGS" | grep -q "Tool hallucination: exit_plan_mode" || { echo "Test 3 failed: Failed to detect tool hallucination"; exit 1; }

echo "All log analysis tests passed."
rm "$MOCK_LOGS"
exit 0
