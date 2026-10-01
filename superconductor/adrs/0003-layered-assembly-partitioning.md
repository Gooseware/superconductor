# 3. Layered Assembly Partitioning (Editing Hierarchy Over Screen Slicing)

Date: 2026-10-01  
Status: Accepted  

## Context
When a user places 20–30 annotations across an application, the notes often span multiple screens and concerns. Slicing tracks naively by screen or view (e.g. `track_checkout`, `track_settings`, `track_dashboard`) causes severe architectural problems:
- Cross-cutting visual tokens (colors, border radiuses, dark mode contrast) get modified repeatedly and inconsistently in each feature branch.
- Shared components (Navbar, UserAvatar, Modal Dialogs) become hot-spots for git merge conflicts when multiple tracks touch them simultaneously.

## Decision
We adopt **Layered Assembly Partitioning (`LayeredAssemblyPartitioning`)**, which organizes feedback into tracks based on the **architectural hierarchy of editing**:
1. **Layer 0 (Prerequisite Foundation)**: All notes tagged `#token`, `#theme`, or `#design-system` are extracted into a prerequisite **Design System & Token Scaffolding Track**.
2. **Layer 1 (Shared Golden Components)**: Notes touching shared atoms and molecules (Navbar, Button, Form Inputs, Dialogs) are aggregated into **Shared Component Refactor Tracks**.
3. **Layer 2 (Downstream Views & Workflows)**: Screen-specific layout logic and feature flows (e.g. Checkout multi-step stepper) form downstream **Feature Tracks** that declare dependency edges on Layer 0 and Layer 1.
4. **Topological Wave Execution**: When compiled, the tracks declare their dependency edges in `superconductor/tracks.md`. The newly merged `ExecutionPlanner.planWaves` will automatically schedule Layer 0 as Wave 0, Layer 1 as Wave 1, and independent Layer 2 feature tracks concurrently in Wave 2 worktree swarms.

## Consequences
### Positive
- Zero duplicate rework: foundational fixes propagate automatically downstream.
- Complete elimination of cross-track merge conflicts on shared component files.
- Perfect topological wave parallelism during subsequent swarm execution.

### Negative
- A user wanting an immediate quick fix on a single view must wait for the prerequisite token/component wave if deep shared dependencies are flagged.
