#!/bin/bash
# Test script for token optimization analysis

OPTIMIZER="superconductor/optimize_tokens.sh"
MOCK_LOGS="superconductor/tracks/self-improvement_20260402/token_logs.json"

if [ ! -f "$OPTIMIZER" ]; then
    echo "Error: $OPTIMIZER does not exist."
    exit 1
fi

chmod +x "$OPTIMIZER"

echo "Creating mock logs with token data..."
cat <<EOF > "$MOCK_LOGS"
[
  { "type": "tool_call", "tool": "read_file", "args": "large_file.md", "tokens": 5000 },
  { "type": "tool_call", "tool": "read_file", "args": "large_file.md", "tokens": 5000 },
  { "type": "tool_call", "tool": "grep_search", "args": "pattern", "tokens": 200 }
]
EOF

echo "Running token optimization tests..."

# Test 1: Detect high-token calls (>1000 tokens)
$OPTIMIZER "$MOCK_LOGS" | grep -q "High token call: read_file" || { echo "Test 1 failed: Failed to detect high-token call"; exit 1; }

# Test 2: Detect redundant reads contributing to token waste
$OPTIMIZER "$MOCK_LOGS" | grep -q "Redundant token waste: read_file" || { echo "Test 2 failed: Failed to detect redundant token waste"; exit 1; }

echo "All token optimization tests passed."
rm "$MOCK_LOGS"
exit 0
