#!/usr/bin/env bash
set -euo pipefail

GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
SOURCE_HOOK="$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"
TARGET_HOOK="$GIT_HOOKS_DIR/pre-commit"

if [ ! -d "$GIT_HOOKS_DIR" ]; then
    mkdir -p "$GIT_HOOKS_DIR"
fi

if [ -f "$TARGET_HOOK" ]; then
    # Idempotent check
    if cmp -s "$SOURCE_HOOK" "$TARGET_HOOK"; then
        echo "[superconductor] Swarm enforcement pre-commit hook already installed."
        exit 0
    fi
    echo "[superconductor] Updating existing pre-commit hook..."
fi

cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"
echo "[superconductor] Swarm enforcement pre-commit hook installed successfully at $TARGET_HOOK"
