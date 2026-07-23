#!/usr/bin/env bash
set -euo pipefail

HOOK_FILE="$(git rev-parse --show-toplevel)/.git/hooks/post-commit"
MARKER="# superconductor:intelligence"

# Idempotency check — do not duplicate the hook block
if [ -f "$HOOK_FILE" ] && grep -q "$MARKER" "$HOOK_FILE"; then
  echo "[superconductor] Intelligence hook already installed, skipping."
  exit 0
fi

# Append to existing hook or create new
cat >> "$HOOK_FILE" << 'HOOK'
# superconductor:intelligence
CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only "$(git hash-object -t tree /dev/null)" HEAD 2>/dev/null || true)
if [ -n "$CHANGED" ]; then
  node "$(git rev-parse --show-toplevel)/packages/superconductor-core/dist/intelligence/cli-update.js" $CHANGED &
fi
HOOK

chmod +x "$HOOK_FILE"
echo "[superconductor] Intelligence hook installed at $HOOK_FILE"
