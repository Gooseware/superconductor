# Specification: Protocol Checkpoints & Legalized Fast-Paths

## 1. Overview
This track introduces strict mechanical protocol enforcement and a legalized fast-path (`--fast`) for the Superconductor workflows to ensure agent reliability and predictability without sacrificing agility for trivial tasks.

## 2. Architecture Committee Recommendations & Research Notes
- **Enforcement via Context Anchoring:** Requiring the agent to output a `[✓]` checklist within its interactive prompts forces it to cognitively anchor to the protocol sequence, reducing the likelihood of skipped steps.
- **Controlled Fast-Path:** A `--fast` flag explicitly authorizes bypassing heavy preflight steps (Architecture Committee, Research), but intentionally preserves the final Oracle/Review Swarm to ensure quality isn't compromised.

## 3. Functional Requirements
1. **`--fast` Flag Support:** Update core Superconductor skills (`new-track.md`, `implement.md`) to parse `{{args}}` for the `--fast` (or `--lite`) flag.
2. **Preflight Bypass:** If the `--fast` flag is present, the agent must legally bypass Best Practices Research and Architecture Committee phases.
3. **Mandatory Checkpoint Echoing:** The agent must embed a literal protocol execution checklist inside all major `ask_user` tool calls (e.g., `[✓] Architecture Committee Convened`) to prove protocol adherence.
4. **Review Swarm in Oracle Cycles:** The `--fast` flag must NOT bypass the final Oracle review. When `--fast` is NOT provided, the Oracle must use the "Review Panel Mode" (heterogeneous review swarm feeding into the Oracle Arbiter) for **every Oracle cycle** (both the periodic 2-3 task cadence and the final audit) to minimize drift. When `--fast` is provided, the Oracle cycles may downgrade to Monolithic mode.

## 4. Acceptance Criteria
- [ ] Running `/superconductor:new-track --fast "typo fix"` cleanly skips the Architecture Committee and Research steps.
- [ ] Running `/superconductor:new-track "build new feature"` forces the agent to render a `[✓]` checklist in the Spec confirmation prompt.
- [ ] The `SKILL.md` protocols explicitly define this branching logic.
- [ ] Running a normal track ensures the Oracle Final Audit is fed by the heterogeneous Review Panel (Flash swarm) rather than running in Monolithic mode.
- [ ] During Pipeline Mode, every periodic Oracle Cadence (e.g., every 3 tasks) also triggers the heterogeneous Review Panel (Flash swarm) to catch drift early.
