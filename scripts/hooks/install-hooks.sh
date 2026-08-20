#!/usr/bin/env bash
set -euo pipefail

GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
SUPERCONDUCTOR_ROOT="${SUPERCONDUCTOR_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SOURCE_HOOK="$SUPERCONDUCTOR_ROOT/scripts/hooks/commit-msg"
if [ ! -f "$SOURCE_HOOK" ]; then
    SOURCE_HOOK="${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/hooks/commit-msg"
fi
TARGET_HOOK="$GIT_HOOKS_DIR/commit-msg"

if [ ! -d "$GIT_HOOKS_DIR" ]; then
    mkdir -p "$GIT_HOOKS_DIR"
fi

if [ -f "$TARGET_HOOK" ]; then
    # Idempotent check
    if cmp -s "$SOURCE_HOOK" "$TARGET_HOOK"; then
        echo "[superconductor] Swarm enforcement commit-msg hook already installed."
        exit 0
    fi
    echo "[superconductor] Updating existing commit-msg hook..."
fi

cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"
echo "[superconductor] Swarm enforcement commit-msg hook installed successfully at $TARGET_HOOK"
