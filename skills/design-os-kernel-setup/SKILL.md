---
name: design-os-kernel-setup
description: Use when you need to initialize, extract, or configure the Design OS Kernel (MCP Server).
---

# Design OS Kernel Setup

## Overview
This skill guides the setup and configuration of the `design-os-kernel`, the core MCP server that drives the Design OS automation.

## When to Use
- Initializing a new project that needs the Design OS automation.
- Extracting the MCP server into a standalone repository.
- User says "Setup the MCP server" or "Kernel is not connected".

## The Process

### 1. Check for Kernel
Check if `packages/design-os-kernel` exists. If not, suggest cloning it from `git@gitlab.com:socialhippos/design-os-kernel`.

### 2. Dependency Check
Verify `npm install` and `npm run build` have been executed in the kernel directory.

### 3. Remote Tracking
Ensure the kernel is tracking the correct origin:
`git remote -v` should show `git@gitlab.com:socialhippos/design-os-kernel`.

### 4. Configuration
Ensure the `README.md` instructions for MCP settings are followed. The agent should help the user copy the JSON snippet for their `claude_desktop_config.json` or equivalent.

### 5. Verification
Run a simple tool call like `registry_recommend(context="test")` to ensure the kernel is responsive.

## Common Mistakes
- Running tools before the kernel is built (`dist/` is missing).
- Incorrect SSH keys for GitLab.
- Missing `local.db` (SQLite) permissions.
