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
if [ ! -f "$HOOK_FILE" ]; then
  echo '#!/usr/bin/env bash' > "$HOOK_FILE"
  chmod +x "$HOOK_FILE"
fi
cat >> "$HOOK_FILE" << 'HOOK'
# superconductor:intelligence
if CHANGED=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only "$(git hash-object -t tree /dev/null)" HEAD 2>/dev/null); then
  CHANGED_ARRAY=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && CHANGED_ARRAY+=("$line")
  done <<< "$CHANGED"
  if [ ${#CHANGED_ARRAY[@]} -gt 0 ]; then
    CLI_SCRIPT="${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/packages/superconductor-core/dist/intelligence/cli-update.js"
    if [ ! -f "$CLI_SCRIPT" ]; then
      CLI_SCRIPT="$(git rev-parse --show-toplevel 2>/dev/null)/packages/superconductor-core/dist/intelligence/cli-update.js"
    fi
    if [ -f "$CLI_SCRIPT" ]; then
      node "$CLI_SCRIPT" "${CHANGED_ARRAY[@]}" &
    fi
  fi
fi
HOOK

chmod +x "$HOOK_FILE"
echo "[superconductor] Intelligence hook installed at $HOOK_FILE"
