# Track: Intelligence & Setup Subsystem Fix

**Track ID:** `intelligence_setup_fix_20260920`  
**Status:** `[ ]` Pending  

## Links
- [Spec](./spec.md)
- [Plan](./plan.md)
- **Branch:** `track/intelligence_setup_fix_20260920`

## Summary
Resolves the chronic `❌ Intelligence: NONE` degraded state in Superconductor. Addresses 6 CRITICAL and 12 supporting issues identified during Architecture Committee review:
1. Replaces faulty `getSuperconductorHome()` resolution in skills with dynamic project root derivation.
2. Injects `PROJECT_ROOT` into `superconductor-kernel` MCP server and removes restrictive directory boundary exceptions.
3. Fixes setup baseline intelligence scan, removes nonexistent MCP tool calls, and eliminates false success reporting.
4. Generates missing `cli-blueprint.ts` and updates plan generation workflow.
5. Extends symbol, dependency, and test gap intelligence runners to support Go, Python, and Rust.
6. Implements a best-in-class dual-mode `ux-reviewer` skill (56-rule evaluative engine for quorum review + generative heuristics for processor pre-load).
