#!/bin/bash
# Log Analyzer for Superconductor
# Analyzes tool-call patterns and errors from a JSON log file.

LOG_FILE="$1"

if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file not found."
    exit 1
fi

# 1. Detect tool hallucinations (Tool not found errors)
grep -B 4 '"error": "Tool not found"' "$LOG_FILE" | grep '"tool"' | sed 's/.*"tool": "\(.*\)".*/Tool hallucination: \1/'

# 2. Detect policy denials
grep -B 4 '"error": "Policy denial"' "$LOG_FILE" | grep '"tool"' | sed 's/.*"tool": "\(.*\)".*/Policy denial: \1/'

# 3. Detect redundant tool calls (Duplicate successful calls with same args)
# Use awk to parse JSON-like structures robustly
awk '
{
    if ($0 ~ /{/) { tool=""; args=""; }
    if ($0 ~ /"tool":/) { t=$0; sub(/^[ \t]*"tool": "/, "", t); sub(/",?$/, "", t); tool=t; }
    if ($0 ~ /"args":/) { a=$0; sub(/^[ \t]*"args": "/, "", a); sub(/",?$/, "", a); args=a; }
    if ($0 ~ /}/ && tool != "" && args != "") {
        key = tool "|||" args;
        count[key]++;
    }
}
END {
    for (k in count) {
        if (count[k] > 1) {
            split(k, parts, "|||");
            print "Redundant call: " parts[1];
        }
    }
}
' "$LOG_FILE" | sort -u

exit 0
