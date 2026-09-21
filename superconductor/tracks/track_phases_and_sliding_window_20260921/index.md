# Track: Track Phase System & Dynamic Sliding-Window Progression

**Track ID:** `track_phases_and_sliding_window_20260921`  
**Status:** `[ ]` Pending  

## Links
- [Spec](./spec.md)
- [Plan](./plan.md)
- **Branch:** `track/track_phases_and_sliding_window_20260921`

## Summary
Introduces a first-class milestone phase system to Superconductor:
1. **Multi-Section Tracks Registry**: Organizes `tracks.md` into distinct phase sections with individual track tables.
2. **Dynamic Sliding-Window Progression**: Automatically promotes Phase 2 to Phase 1 when Phase 1 is 100% complete.
3. **Decoupled Symbolic Phase IDs**: Stores permanent symbolic IDs in `metadata.json` (`"phase_id": "core-foundation"`) to prevent broken references across ADRs and commit logs.
4. **Interactive Phase Switcher (`/superconductor:phase`)**: Adds dedicated CLI commands (`list`, `switch`, `status`, `next`) and `--phase` flags on `batch-execute` and `status`.
5. **Phase-Aware Batch Execution**: Executes only pending tracks within the targeted phase, defaulting to interactive continuation on morning presents without deadlocking the queue.
6. **Multi-Table AST Parser**: Replaces brittle regexes in `track-reader.ts` and `migrate-tracks.ts` to prevent silent table truncation, with backward compatibility for legacy unphased tracks.
