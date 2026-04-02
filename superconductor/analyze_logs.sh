#!/bin/bash
# Refined Log Analyzer for Superconductor (Guided Rails)

# 1. Automatic Log Detection
LOG_DIR="/home/gooseware/.gemini/tmp/superconductor/chats"
SESSION_FILE="$1"

if [ -z "$SESSION_FILE" ]; then
    SESSION_FILE=$(ls -t "$LOG_DIR"/session-*.json 2>/dev/null | head -n 1)
fi

if [ ! -f "$SESSION_FILE" ]; then
    echo "Error: No session file found."
    exit 1
fi

echo "--- Superconductor Analysis: $(basename "$SESSION_FILE") ---"

# 2. Known Good Tool List (Superconductor Core)
SUPERCONDUCTOR_TOOLS=("setup" "newTrack" "implement" "status" "revert" "review")
CORE_HARNESS_TOOLS=("list_directory" "read_file" "grep_search" "glob" "replace" "write_file" "ask_user" "run_shell_command")

# 3. Detect Faulty/Ineffective Tool Use
echo "[Faulty Tool Use]"
# Look for error responses in tool calls
grep -B 15 '"status": "error"' "$SESSION_FILE" | grep -E '"name":' | sed 's/.*"name": "\(.*\)".*/  - Error in tool: \1/' | sort | uniq -c

# 4. Detect Specific Hallucinations (Not in harness list)
echo ""
echo "[Tool Hallucinations]"
grep '"name":' "$SESSION_FILE" | sed 's/.*"name": "\(.*\)".*/\1/' | sort -u | while read -r tool; do
    is_valid=false
    for t in "${CORE_HARNESS_TOOLS[@]}"; do
        if [ "$tool" == "$t" ]; then is_valid=true; break; fi
    done
    if [ "$is_valid" == "false" ]; then
        echo "  - Hallucinated/Unknown tool: $tool"
    fi
done

# 5. Detect Redundant/Ineffective 'replace' attempts
echo ""
echo "[Ineffective Edits]"
grep -A 5 '"name": "replace"' "$SESSION_FILE" | grep -E "0 occurrences found|Failed to edit" | wc -l | awk '{print "  - Failed replace attempts: " $1}'

echo "--------------------------------------------------------"
exit 0
