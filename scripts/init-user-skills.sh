#!/bin/bash
set -e

USER_SKILLS_DIR="$HOME/.superconductor/skills"
PLUGIN_SKILLS_DIR="$(cd "$(dirname "$0")/../skills" && pwd)"

# Idempotent init of git repo in ~/.superconductor
if [ ! -d "$HOME/.superconductor/.git" ]; then
    mkdir -p "$USER_SKILLS_DIR"
    cd "$HOME/.superconductor"
    git init
    git commit --allow-empty -m "chore: init superconductor config"
fi

mkdir -p "$USER_SKILLS_DIR"

declare -a SKILLS=("security-reviewer" "correctness-reviewer" "adversarial-reviewer" "coding-agent")

CHANGES_MADE=0

for skill in "${SKILLS[@]}"; do
    if [ -d "$PLUGIN_SKILLS_DIR/$skill" ] && [ ! -d "$USER_SKILLS_DIR/$skill" ]; then
        cp -r "$PLUGIN_SKILLS_DIR/$skill" "$USER_SKILLS_DIR/$skill"
        CHANGES_MADE=1
    fi
done

if [ "$CHANGES_MADE" -eq 1 ]; then
    cd "$HOME/.superconductor"
    git add skills/
    if ! git diff --staged --quiet; then
        git commit -m "chore(abi): seed user skill directory"
    fi
fi

echo "User skill directory initialization complete."
