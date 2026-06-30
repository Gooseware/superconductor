# Packages Directory

This directory contains external package repositories integrated as Git submodules.

## Packages Included

### `design-os-kernel`
The core Model Context Protocol (MCP) server that powers Design OS.
- **Repository:** `git@gitlab.com:socialhippos/design-os-kernel`
- **Path:** `packages/design-os-kernel`

---

## Developer / Installation Guide

When cloning this repository for the first time, you must initialize and build the submodules.

### 1. Initialize Submodules
Run the following command from the repository root:
```bash
git submodule update --init --recursive
```

### 2. Build the Kernel
The MCP server needs to be built locally before use:
```bash
cd packages/design-os-kernel
npm install
npm run build
```
This compiles the TypeScript source code into `dist/index.js`.

### 3. Updating the Kernel
To update the submodule to the latest upstream main:
```bash
git submodule update --remote packages/design-os-kernel
```
Remember to rebuild the kernel (`npm run build`) after updating!
