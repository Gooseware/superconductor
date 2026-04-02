#!/bin/bash
# Tool and Path Validator for Superconductor (Plan Mode Aware)

TOOL="$1"
PATH_ARG="$2"

# 1. Valid Tool List (Harness + Sub-agents)
VALID_TOOLS=("list_directory" "read_file" "grep_search" "glob" "replace" "write_file" "web_fetch" "run_shell_command" "save_memory" "google_web_search" "ask_user" "codebase_investigator" "cli_help" "generalist" "activate_skill")

# 2. Check for Hallucinated Tool
is_valid_tool=false
for t in "${VALID_TOOLS[@]}"; do
    if [ "$TOOL" == "$t" ]; then
        is_valid_tool=true
        break
    fi
done

if [ "$is_valid_tool" == "false" ]; then
    echo "Error: Tool hallucination detected - '$TOOL' is not a valid tool."
    exit 1
fi

# 3. Path Verification (Plan Mode Safeguard)
# Plan Mode requires relative paths starting with 'superconductor/'
if [[ -n "$PATH_ARG" ]]; then
    # Reject absolute paths
    if [[ "$PATH_ARG" == /* ]]; then
        echo "Error: Absolute path detected - '$PATH_ARG'. Plan Mode requires relative paths."
        exit 1
    fi

    # Reject paths not starting with 'superconductor/' (unless it's a read-only or authorized list tool)
    # Note: This is a strict check for tools that modify the filesystem in Plan Mode.
    if [[ "$TOOL" == "write_file" || "$TOOL" == "replace" ]]; then
        if [[ ! "$PATH_ARG" == superconductor/* ]]; then
            echo "Error: Unsafe path for Plan Mode - '$PATH_ARG'. Must be within 'superconductor/'."
            exit 1
        fi
    fi
fi

echo "Tool call '$TOOL $PATH_ARG' validated successfully."
exit 0
