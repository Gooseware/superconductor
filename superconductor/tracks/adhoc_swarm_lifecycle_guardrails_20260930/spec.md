# Track Specification: Ad-Hoc Enhancement & Bug Fix Lifecycle Guardrails — Micro-Swarm Flow, Strict Planning/Dispatch Dogma & Dynamic 5-Reviewer Quorum

**Track ID:** `adhoc_swarm_lifecycle_guardrails_20260930`  
**Target Milestone Phase:** `core-foundation` (Active)  
**Track Type:** Protocol Hardening / Core Orchestration Enhancement  

---

## 1.0 Executive Summary & Background

In long-running sessions (such as conversation `540e5113-7bb7-45a5-ac59-9fd4a707256f`), multiple systemic breakdown patterns emerged:
1. **Ad-hoc Requests Bypassed the Multi-Agent Flow**: Following track completion (`[x]`), user requests for behavioral adjustments (e.g. purge candidates, automated sweep rules, copy updates) fell outside active track mode. The triage protocol only caught explicit error keywords/stack traces, causing the root agent to default into standard chat mode and perform 35+ direct file edits ("hero-agenting") rather than dispatching subagents.
2. **Serial Implementation Bottleneck**: Legacy text in `skills/implement/SKILL.md` commanded the agent to *"loop through each task one by one"*, causing implementors to run sequentially rather than in parallel batches.
3. **Quorum Reviewer Omission**: Review templates and authorization scripts hardcoded 4 reviewers, omitting the UI/UX & Ergonomics reviewer until manually prompted by the user.

This track hardens Superconductor's core lifecycle so that **all code changes—whether part of a formal track or an ad-hoc post-track enhancement—remain on multi-agent rails from the start**.

---

## 2.0 Architectural Committee & Research Findings

- **Primary Agent Dogma (Planning & Dispatch Only)**: Even when YOLO mode is active, the primary agent must treat itself strictly as an **Orchestrator and Conductor**. Direct writes to application source files by the root agent are prohibited; all implementation is delegated to parallel subagents.
- **Universal Ad-Hoc Micro-Swarm**: Triage detection is expanded beyond failure keywords to detect feature adjustments, copy tweaks, and post-track feedback. It dynamically launches an ephemeral Micro-Swarm (parallel processors in isolated worktrees -> mandatory Quorum -> remediation if red).
- **Mandatory Review Quorum Policy**:
  - **Regression Reviewer**: Always mandatory on every change to prevent silent breaks.
  - **UI/UX & Ergonomics Reviewer**: Automatically mandatory whenever frontend components, styles, routes, templates, or user-facing copy are touched.
  - **Security, Correctness, and Adversarial**: Round out the robust 5-reviewer panel.
- **Plan Task Loop Modernization**: Remove legacy serial task iteration from `implement/SKILL.md` and replace with `swarm-execute`'s Minimum Concurrency Gate and batch parallel dispatch.

---

## 3.0 Acceptance Criteria (ACs)

- **AC-1 (Root Planning & Dispatch Dogma)**: Codify in `GEMINI.md`, `skills/implement/SKILL.md`, `skills/swarm-execute/SKILL.md`, and core workspace guards that the primary session is strictly **Planning & Dispatch Only** even under YOLO mode. Root direct edits to application source files are blocked and must route to `invoke_subagent`.
- **AC-2 (Universal Ad-Hoc Enhancement & Triage Protocol)**: Extend `skills/triage/SKILL.md` and the Ad-Hoc Triage Protocol in `GEMINI.md` to classify non-error ad-hoc enhancement/tweak requests, routing them automatically to an ephemeral Micro-Swarm without manual track creation overhead.
- **AC-3 (Minimum Concurrency Gate in Implement Skill)**: Eliminate `loop through each task one by one` in `skills/implement/SKILL.md`. Synchronize with `skills/swarm-execute/SKILL.md` to enforce parallel batch dispatch (`min(remaining, maxConcurrent)`) with worktree isolation.
- **AC-4 (Always-On Regression & Mandatory UI/UX Quorum Rules)**: Formalize Quorum Reviewer composition across `swarm-execute`, `implement`, and `triage`: Regression is always mandatory; UI/UX & Ergonomics is required whenever UI/UX/copy files are modified; full 5-reviewer quorum remains default for multi-file tracks.
- **AC-5 (SwarmAuthorizer & Trailer 5-Reviewer Alignment)**: Update `SwarmAuthorizer` and commit trailer generation tools in `packages/superconductor-core` to seamlessly handle 4-to-5 reviewer conversation IDs without truncation or schema errors.
- **AC-6 (Comprehensive Verification & Unit Tests)**: Add automated test coverage in `packages/superconductor-core/src/orchestration/__tests__` and `packages/superconductor-core/src/remediation` verifying micro-swarm dispatch, triage routing for enhancements, and concurrency gate compliance.
