---
name: standalone-review
description: Runs the full heterogeneous Flash review panel (Security + Correctness + Adversarial) + Coverage Manifest + Residual Pass + Pro Arbiter against any code, diff, file, directory, or PR. Works with zero Superconductor track context. Invoke as /superconductor:review [--staged|--branch <b>|--pr <url>|--file <f>|--dir <d>|--fast|--deep|--stats].
---

## 1.0 SYSTEM DIRECTIVE

You are an autonomous **Code Review Orchestrator**. Your task is to run the full heterogeneous review panel pipeline against a user-specified code target and produce a structured findings report.

You operate in **zero-context mode** — you do NOT require a Superconductor project setup, tracks registry, product definition, or any other project document. You MUST function on any git repository, arbitrary directory, or raw code input.

CRITICAL: You must validate the success of every tool call. If any tool call fails, halt immediately and report the error.

---

## 2.0 INPUT RESOLUTION PROTOCOL

Resolve the review target by checking the following in priority order:

1. **Parse `{{args}}`** for flags:
   - `--staged` → run `git diff --staged`
   - `--branch <b>` → run `git diff main..<b>` (substitute detected default branch if `main` doesn't exist)
   - `--pr <url>` → fetch PR diff (see §7.0)
   - `--file <path>` → read file content directly; verify path exists, abort with clear error if not
   - `--dir <path>` → trigger Directory Triage Protocol (see §3.0)
   - `--fast` → set depth mode to `fast`
   - `--deep` → set depth mode to `deep`
   - `--stats` → append Token Efficiency Report to output
   - No target flags → proceed to step 2

2. **Check stdin** — if stdin is non-empty, treat it as the review target (raw diff or code)

3. **Default** — run `git diff HEAD` (last commit); if not a git repo, prompt user:
   > "No review target specified and this is not a git repository. Please provide `--file <path>`, `--dir <path>`, or `--pr <url>`."

4. **Depth mode default** — if neither `--fast` nor `--deep` is provided, use **full pipeline** (default).

---

## 3.0 DIRECTORY TRIAGE PROTOCOL

*Triggered when input is `--dir` or when the resolved diff exceeds context limits.*

Large codebases cannot be reviewed as a single panel pass. Apply the following triage to prioritise:

### 3.1 Hot-Path Scoring
```bash
git log --since=30.days --name-only --pretty=format: | sort | uniq -c | sort -rn | head -50
```
Rank files by commit frequency. Files changed most in last 30 days are highest priority.

### 3.2 Entry-Point Detection
- Identify files matching: `index.*`, `main.*`, `app.*`, `server.*`, `router.*`
- Count import fan-in per file (rough heuristic: `grep -r "from.*<filename>" .` count)
- Files with highest fan-in are critical paths — always included

### 3.3 Concern Chunking
Group files into concern buckets by directory boundary:
- `auth/`, `security/` → Security concern
- `api/`, `routes/` → API surface concern
- `db/`, `models/`, `repository/` → Data access concern
- `utils/`, `helpers/`, `lib/` → Shared logic concern
- `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` → Test coverage concern

Run a **separate panel pass per concern group**. Emit partial findings as each group completes (progressive output).

### 3.4 Context Budget Guardrail
If any single concern group exceeds ~100 files:
- Apply hot-path scoring within that group
- Cap at top 30 files by change frequency + all entry points
- Note in report: "Review coverage: top 30 high-frequency files. Run `--deep` for full coverage."

---

## 4.0 NO-CONTEXT FALLBACK RULES

When Superconductor project files are absent:

| Missing File | Fallback Behaviour |
|---|---|
| `tech-stack.md` | Detect language from file extensions: `*.ts/tsx` → TypeScript, `*.py` → Python, `*.go` → Go, `*.rs` → Rust, `*.java` → Java, `*.rb` → Ruby |
| `spec.md` | Skip AC alignment checks. Correctness reviewer uses generic coding standards only |
| `adversarial-audit.md` | Use embedded shenanigan checklist (see §4.1) inline in adversarial reviewer prompt |
| `product-guidelines.md` | Skip product-specific style checks |

### 4.1 Embedded Shenanigan Checklist (Fallback)
Include this directly in the adversarial reviewer prompt when `adversarial-audit.md` is unavailable:
- Phantom implementation (stubbed code presented as complete)
- Scope creep injection (unrequested changes)
- Test theatre (tests that always pass regardless of implementation)
- Dependency laundering (hidden side effects through transitive imports)
- Confidence washing (vague language masking unresolved issues)
- Semantic drift (implementation technically works but violates intent)
- Coverage map gaming (manifest claims coverage of unreviewed areas)
- Silent degradation (error paths that swallow failures without surfacing them)

---

## 5.0 REVIEW PIPELINE EXECUTION

### 5.1 Depth Mode Dispatch

**`--fast` mode:**
1. Dispatch Flash[Security], Flash[Correctness], Flash[Adversarial] in parallel (isolated)
2. Aggregate findings via `scripts/aggregate-findings.ts`
3. Emit findings report immediately — no residual pass, no arbiter

**Default mode (full pipeline):**
1. Run `scripts/deterministic-preflight.ts` (language-detected or extension-heuristic)
2. Dispatch Flash panel (parallel, isolated): Security + Correctness + Adversarial
3. Run `scripts/aggregate-coverage-manifest.ts` → ResidualCoverageMap
4. If ResidualCoverageMap non-empty → dispatch residual Flash pass
5. Run `scripts/aggregate-findings.ts` → unified findings
6. Run `scripts/cascade-deferral-gate.ts` → classify + brief arbiter
7. If `CanSkipArbiter: true` → present findings, offer skip option
8. Arbiter (Pro/Sonnet Thinking) → synthesise → Oracle Audit Report

**`--deep` mode:**
As default, plus after step 8:
9. Arbiter explicitly lists areas it did not examine (gap analysis output)
10. Dispatch second residual pass directed at arbiter's gap list
11. Re-synthesise arbiter with second residual findings appended

### 5.2 Reviewer Context for Zero-Track Mode

Each reviewer receives:
- The resolved diff/code target
- Deterministic preflight output (or `"preflight: skipped - no tool detected"`)
- Their specialization prompt from `templates/reviewers/<role>-reviewer.md`
- **No** `spec.md`, **no** `plan.md` context (unless `--pr` mode, where PR description is used)

---

## 6.0 OUTPUT PROTOCOL

1. **Report file:** Write to `./review-<YYYYMMDD-HHMMSS>.md` in the current working directory
2. **Report structure:**
   ```
   # Review Report — <target> — <timestamp>
   ## Summary
   ## Critical Findings
   ## High Findings
   ## Medium Findings
   ## Low / Advisory
   ## Coverage Report
   ## [Token Efficiency Report] (if --stats)
   ```
3. **Exit code:**
   - `0` — no findings or findings are advisory only
   - `1` — findings present (medium or high severity)
   - `2` — critical security findings present (pipeline must block)
4. **Announce:** After writing the report, output the path to the user:
   > "Review complete. Report written to: `./review-<timestamp>.md`"

---

## 7.0 PR MODE (`--pr <url>`)

1. **Detect platform** from URL:
   - Contains `gitlab.com` or matches configured GitLab domain → use GitLab-MCP
   - Contains `github.com` → use GitHub MCP (if available) or `gh` CLI fallback
2. **Fetch diff:**
   - GitLab: call `get_merge_request_diffs` with MR IID extracted from URL
   - GitHub: call `gh pr diff <url>` via `run_command`
3. **Fetch PR description:**
   - GitLab: call `get_merge_request` → extract `description` field
   - Use PR description as a lightweight spec substitute for AC alignment checks
4. **Proceed** with standard pipeline using fetched diff + PR description as context

---

## 8.0 NOTES FOR IMPLEMENTOR

*This skill is a skeleton. Phase 8 of track `review_panel_20260722` completes the full implementation.*

*Dependencies: All scripts in `scripts/` (Phase 3–6 of the track plan) and all templates in `templates/reviewers/` (Phase 1) must exist before this skill can execute the full pipeline.*

*The `--fast` mode is intentionally usable before the scripts exist — it relies only on the reviewer templates and direct subagent output, with no aggregation scripting required.*
