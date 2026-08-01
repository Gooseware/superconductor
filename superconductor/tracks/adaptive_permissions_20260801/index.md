# Track: Adaptive Permission System

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)

## Summary

Implements an **Adaptive Permission State Machine** for Superconductor that:

1. **IDLE Mode** — Removes all restrictions when no track is active (no more friction for exploratory work)
2. **TRACKED Mode** — Planner auto-infers required permissions from spec keywords; only scoped capabilities are allowed
3. **YOLO Mode** — Global override flag (`--yolo [--persist]`) with full audit trail

Key components:
- `packages/superconductor-core/src/permissions/` — New permission domain module
- `permission-manifest.toml` — Per-track declarative permission file
- `.superconductor/session-flags.json` — Session-scoped YOLO persistence
- `superconductor/logs/yolo-audit.log` — Append-only bypass audit trail
- `/superconductor:yolo` — New command shortcut

## Status

- [ ] Phase 0: Swarm Preflight
- [ ] Phase 1: Permission State Machine Core
- [ ] Phase 2: IDLE Mode
- [ ] Phase 3: YOLO Mode
- [ ] Phase 4: Planner Permission Inference
- [ ] Phase 5: Per-Blocker Inline Override
- [ ] Phase 6: Integration & Finalization
