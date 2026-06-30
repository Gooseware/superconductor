# Model Routing Strategy

This document defines the 4-tier model routing strategy integrated into Superconductor. The goal of this strategy is to optimize inference costs and response latency by matching task complexity to the absolute cheapest model class capable of completing it successfully.

---

## 1. Core Model Routing Tiers

The framework operates on a 4-tier cascade model, mapped to the Gemini and Claude families of models:

| Tier | Category | Target Models | Description & Purpose | Cost Profile |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Deterministic** | Local CLI Tools / Shell | Exact string matching, syntax validation, file system checks, test suite execution, git commands. These run directly on the host machine without API calls. | **Free** ($0.00) |
| **Tier 2** | **Triage & Extraction** | `gemini-2.0-flash-lite`<br>`claude-3-5-haiku` | Light JSON parsing, intent classification, routing decisions, summarizing plan status, simple triage of tool outputs. High speed, low latency. | **Ultra-Low** (~$0.075/1M in) |
| **Tier 3** | **Standard Inference** | `gemini-2.5-pro`<br>`claude-3-5-sonnet` | Code generation, test writing, standard code reviews, refactoring, applying style guides, reasoning about single-file changes. Balanced power. | **Mid-Tier** (~$1.25/1M in) |
| **Tier 4** | **Frontier Reasoning** | `gemini-2.5-pro` (thinking)<br>`deepseek-r1` | Complex structural refactoring, fixing cascading build/test errors, strategic project-level planning, resolving dense multi-file logic errors. | **Premium** (~$3.00+/1M in) |

---

## 2. Superconductor Workflow Phase Mapping

Every phase of the Superconductor task lifecycle is mapped to an advisory or hard-enforced routing tier:

| Workflow Phase | Recommended Tier | Execution Protocol |
| :--- | :--- | :--- |
| **Scaffolding & Setup** | **Tier 2** | Scans local filesystem, reads catalog, asks setup questions, and drafts initial config templates. |
| **Track Generation** | **Tier 3** | Creates specifications (`spec.md`) and plans (`plan.md`). Requires deep understanding of product vision and tech stack. |
| **Branch Management** | **Tier 1** | Runs git checkout/pull/branch commands deterministically. |
| **Test Writing (Red)** | **Tier 3** | Generates failing unit tests based on tasks. |
| **Test Verification** | **Tier 1** | Runs `npm test`, `pytest`, etc. in shell. |
| **Code Implementation** | **Tier 3** | Writes application logic to pass tests. |
| **Cascading Debugging** | **Tier 4** | Actively escalated if tests fail repeatedly or logic gets stuck in loop. |
| **Documentation Sync** | **Tier 2** | Summarizes track outcome and checks/updates product/tech-stack files. |
| **Oracle Code Review** | **Tier 4** / **Tier 3** | "Pro" audit uses Tier 4; "Flash" audit uses Tier 3. |

---

## 3. Tier 1: Shell-for-Execution / LLM-for-Interpretation

To achieve optimal efficiency, all Tier 1 tasks follow the **Shell-for-Execution / LLM-for-Interpretation** pattern:

1. **Deterministic Execution:** The agent bypasses expensive LLM planning steps and directly triggers a shell command (e.g., test command, git command, file checker).
2. **Context Feeding:** The command stdout/stderr and exit code are captured and injected back into the active context.
3. **Smart Interpretation:** The agent's LLM reads the raw shell output to determine semantic success or failures (e.g., parsing which test failed and why, or verifying a branch merged successfully).

This ensures we do not waste token budget asking an LLM to "decide" whether a file exists or whether tests passed when a simple command execution can verify it immediately.
