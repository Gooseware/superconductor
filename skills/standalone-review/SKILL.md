---
name: standalone-review
description: Runs the full heterogeneous Flash quorum (Security + Correctness + Adversarial + Regression + UX & Ergonomics) + Coverage Manifest + Residual Pass + Pro Arbiter against any code, diff, file, directory, or PR. Works with zero Superconductor track context. Invoke as /superconductor:review [--staged|--branch <b>|--pr <url>|--file <f>|--dir <d>|--fast|--deep|--stats].
---

## 1.0 SYSTEM DIRECTIVE

You are an autonomous **Code Review Orchestrator**. Your task is to run the full heterogeneous quorum pipeline against a user-specified code target and produce a structured findings report.

You operate in two modes:
- **Track-Aware Mode** (preferred): If an active Superconductor track is detected, automatically load its `plan.md` and `spec.md` as the AC baseline. The Plan-Gap Protocol (§5.3) runs automatically.
- **Zero-Context Mode** (fallback): No Superconductor setup required. Functions on any git repo, arbitrary directory, or raw code input.

Track detection happens FIRST, before input resolution (see §2.5).

CRITICAL: You MUST validate the success of every tool call. If any tool call fails, halt immediately and report the error.

---

## 2.0 INPUT RESOLUTION PROTOCOL

**Step 0 (run first):** Execute Track Detection (§2.5) before resolving any other input.

Resolve the review target by checking the following in priority order:

1. **Parse `{{args}}`** for flags:
   - `--staged` → run `git diff --staged`
   - `--branch <b>` → Runs automatic quorum loop via `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/quorum-review.ts`. FSM state persisted to LibSQL. Max 5 cycles. Zero-bias re-run on each cycle.
   - `--pr <url>` → fetch PR diff (see §7.0)
   - `--file <path>` → read file content directly; verify path exists, abort with clear error if not
   - `--codebase` / `--dir <path>` → Runs `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/codebase-review-orchestrator.ts`. Domains scored by 0.4×Hotspot + 0.35×FanIn + 0.25×GitChurn. Sequential processing, most critical first.
   - `--fast` → set depth mode to `fast`
   - `--deep` → set depth mode to `deep`
   - `--remediate` → forces launch of the Swarm Remediation Engine regardless of mode
   - `--headless` → auto-launches remediation for CRITICAL or HIGH findings (see §9.1)
   - `--no-signoff` → Skips SignOffGate user approval. Activity logged to `superconductor/logs/yolo-audit.log`.
   - `--stats` → append Token Efficiency Report to output
   - `--no-track` → explicitly disable track detection, force zero-context mode
   - `--no-preflight` → skip the preflight test execution phase (Preflight Test Runner) before quorum review
   - `--preflight-timeout <ms>` → configure max timeout for preflight execution (default 120000ms)
   - No target flags → proceed to step 2

2. **Check stdin** — if stdin is non-empty, treat it as the review target (raw diff or code)

3. **Default** — run `git diff HEAD` (last commit); if not a git repo, prompt user:
   > "No review target specified and this is not a git repository. Please provide `--file <path>`, `--dir <path>`, or `--pr <url>`."

4. **Depth mode default** — if neither `--fast` nor `--deep` is provided, use **full pipeline** (default).

---

## 2.5 TRACK DETECTION PROTOCOL

Run this **before** resolving the review target. Do NOT skip even in zero-context mode.

### Detection Steps:

```bash
# Step 1: Check for active (unchecked) tracks in the tracks registry
grep -n '\- \[ \]' superconductor/tracks.md 2>/dev/null | head -5
```

If one or more `- [ ]` (incomplete) tracks are found:
1. Extract the most recent incomplete track's folder path from the registry link
2. Read `<track_folder>/plan.md` — extract AC list and named test cases
3. Read `<track_folder>/spec.md` if it exists — extract functional requirements
4. Set **Track-Aware Mode: ON**. Report to user:
   > "📋 Active track detected: **<track_name>** — Plan-Gap Protocol will run automatically."

If no incomplete tracks or `superconductor/tracks.md` does not exist:
- Set **Track-Aware Mode: OFF** (zero-context fallback)
- Proceed with standard zero-context review

### In Track-Aware Mode:

| What changes | Detail |
|---|---|
| **Plan-Gap Protocol** | Runs automatically (§5.3), no need for `--pr` to trigger it |
| **AC Baseline** | Extracted from `plan.md` — all `- [ ]` and `- [x]` items are cross-referenced |
| **Named Test Cases** | All `Test:` lines in `plan.md` verified per §9.3 |
| **Correctness Reviewer context** | Receives `plan.md` ACs as the spec alignment source |
| **Report header** | Includes `**Track:** <track_name>` and `**AC Coverage:** <N>/<total> satisfied` |
| **Phase Omission Check** | Shenanigan #9 check automatically runs (cross-reference plan phases against diff) |

### Track Detection Announcement Format:

```text
╔══════════════════════════════════════════════╗
║  Track-Aware Mode: ON                        ║
║  Track: <track_name>                         ║
║  Plan: superconductor/tracks/<id>/plan.md    ║
║  ACs loaded: <N> acceptance criteria         ║
║  Named tests: <N> test cases to verify       ║
╚══════════════════════════════════════════════╝
```


## 4.0 NO-CONTEXT FALLBACK RULES

When Superconductor project files are absent:

| Missing File | Fallback Behaviour |
|---|---|
| `tech-stack.md` | Detect language from file extensions: `*.ts/tsx` → TypeScript, `*.py` → Python, `*.go` → Go, `*.rs` → Rust, `*.java` → Java, `*.rb` → Ruby |
| `spec.md` | Skip AC alignment checks. Correctness reviewer uses generic coding standards only |
| `skills/code-review-skill/reference/cross-cutting/adversarial-audit.md` | Use embedded shenanigan checklist (see §4.1) inline in adversarial reviewer prompt |
| `product-guidelines.md` | Skip product-specific style checks |

### 4.1 Embedded Shenanigan Checklist (Fallback)
Include this directly in the adversarial reviewer prompt when `skills/code-review-skill/reference/cross-cutting/adversarial-audit.md` is unavailable:
- Phantom implementation (stubbed code presented as complete)
- Scope creep injection (unrequested changes)
- Test theatre (tests that always pass regardless of implementation)
- Dependency laundering (hidden side effects through transitive imports)
- Confidence washing (vague language masking unresolved issues)
- Semantic drift (implementation technically works but violates intent)
- Coverage map gaming (manifest claims coverage of unreviewed areas)
- Silent degradation (error paths that swallow failures without surfacing them)

### 4.2 Subagent Quorum Dispatch Protocol (MANDATORY)

You MUST ALWAYS dispatch the 5 heterogeneous review roles (Security, Correctness, Adversarial, Regression, UX & Ergonomics) as distinct concurrent subagents using the `invoke_subagent` tool. You are STRICTLY PROHIBITED from evaluating, simulating, or writing reviewer verdicts in-process within your own session (e.g., executing roles directly or in parallel in-process is forbidden).

The 5th seat—`ux-reviewer`—audits CLI ergonomics, UX-2 status lines (`[ICON] [MODULE]: ...`), Elm/Rust 7-element error diagnostics, canonical terminology, and executes the 56-rule programmatic `UxRuleEngine`.

#### Quorum Preflight Test Execution & Context Injection Protocol (MANDATORY)
Before dispatching the 5 Quorum Reviewer subagents, the orchestrator MUST run the Preflight Test Runner (`QuorumPreflightTestRunner` / `runPreflightTests`) once and inject the formatted `## Preflight Test Execution Evidence` block directly into the system prompts and context of all 5 subagents (unless `--no-preflight` is explicitly set).
This single pre-execution prevents parallel subagents from executing `npm test` redundantly and saturating CPU/memory resources.

Dispatch Call Pattern:
```javascript
invoke_subagent({
  Subagents: [
    { TypeName: "superconductor-reviewer", Role: "security-reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "correctness-reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "adversarial-reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "regression-reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "ux-reviewer", Prompt: "..." }
  ]
})
```

Rule: NEVER conclude a quorum review until all 4 subagents (plus ux-reviewer for all 5 subagents) have returned their independent verdicts.

### 4.3 Structured JSON Output Extraction Block Schema
All subagent reviewers MUST return their structured findings enclosed in the standard markdown block:
```json:review-findings
[
  {
    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "domain": "security" | "logic" | "tests" | "types" | "frontend" | "config" | "schema" | "ux-review",
    "file": "path/to/file.tsx",
    "line": 42,
    "description": "..."
  }
]
```

### Adversarial Edge Case Execution Protocol

> **CRITICAL — Shenanigan #11:** A clean-pass verdict issued without executed code is grade inflation by definition. Every review MUST produce terminal output, computed values, or inline traces as evidence. A reading-only pass is automatically rejected.

For every non-trivial function in the diff, **execute** it (not just read it) against the worst-input set **before** declaring it clean:

| Input class | Examples | What typically breaks |
|---|---|---|
| Empty collection | `[]`, `{}`, `""` | Array operations, reduce, first/last access |
| Non-numeric string where number expected | `"all"`, `"N/A"`, `""` | `parseInt` → `NaN` → silent comparison failure |
| Zero / falsy number | `0`, `0.0` | Gate conditions that conflate 0 with false |
| Null / undefined | `null`, `undefined` | Dereference, optional chaining gaps |
| **Zero reviewer/count** | `N=0`, `totalReviewersCount=0` | `agreement < 0` always false → phantom unanimous gate |
| Negative numeric input | `-1`, `-9999` | Cost/savings formulas produce absurd positive output |
| Concurrent call | Two calls simultaneously | Race conditions, double-write |

**Mandatory boundary execution template:**
```bash
cat > /tmp/edge_test.ts << 'EOF'
// import the function under review
// run each boundary: N=0, N=1, N=-1, N=MAX
EOF
npx -y tsx /tmp/edge_test.ts
```
Paste the output into the review body. This is the execution evidence required by `skills/code-review-skill/reference/cross-cutting/adversarial-audit.md §9.4`.

**Logic Inversion Test** — for every boolean gate, ask: *does the else-path (the off-path) do the right thing?* Specifically look for inverted semantics where the common/clean case triggers the expensive path:
```text
Pattern to catch:  can_skip = condition && items.length > 0
Inversion:         items.length == 0 (clean, nothing to do) → can_skip = false → triggers expensive Arbiter
Correct intent:    empty = clean pass, should always skip
```

- 🔴 **Write-Path / Read-Path Split Test [blocking]:** For every `readFile` / database read / cache lookup, verify a corresponding **write** exists in this diff or in already-verified code. A read-path with no write-path will always read stale or empty data.

- 🔴 **Resource Safety Test [blocking]:** For every blocking subprocess call (`execSync`, `child_process`, network call): verify a **timeout** is set. No timeout in a headless pipeline = infinite hang.

---

## 5.0 REVIEW PIPELINE EXECUTION

### 5.1 Depth Mode Dispatch

**`--fast` mode:**
1. Dispatch Flash[Security], Flash[Correctness], Flash[Adversarial], Flash[Regression], Flash[UX & Ergonomics] in parallel (isolated)
2. Aggregate findings via `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/aggregate-findings.ts`
3. Emit findings report immediately — no residual pass, no arbiter

**Default mode (full pipeline):**
1. Run `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/deterministic-preflight.ts` (language-detected or extension-heuristic)
2. Run `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/quorum-review.ts` to orchestrate `review > remediate > review` cycle (up to maxIterations) across the Flash panel: Security + Correctness + Adversarial + Regression + UX & Ergonomics
3. Run `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/aggregate-coverage-manifest.ts` → ResidualCoverageMap
4. If ResidualCoverageMap non-empty → dispatch residual Flash pass
5. Run `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/aggregate-findings.ts` → unified findings
6. Run `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/cascade-deferral-gate.ts` → classify + brief arbiter
7. If `CanSkipArbiter: true` → present findings, offer skip option
8. Arbiter (Pro/Sonnet Thinking) → synthesise → Oracle Audit Report

**`--deep` mode:**
As default, plus after step 8:
9. Arbiter explicitly lists areas it did not examine (gap analysis output)
10. Dispatch second residual pass directed at arbiter's gap list
11. Re-synthesise arbiter with second residual findings appended

### 5.2 Reviewer Context for Zero-Track Mode

**Intelligence Context Injection (before fan-out):**
- Resolve project root and output directory:
  ```bash
  PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  OUTPUT_DIR="$PROJECT_ROOT/superconductor/intelligence"
  ```
- Run intelligence preflight via `IntelligencePreflightCheck.run(PROJECT_ROOT, OUTPUT_DIR)` or load `RepoContext` via `IntelligenceSnapshotReader.load(OUTPUT_DIR, PROJECT_ROOT)`.
- **Mismatch Detection:** If `manifest.projectRoot` differs from current workspace `PROJECT_ROOT` (`git rev-parse --show-toplevel`), emit the UX-2 standard warning:
  ```text
  [superconductor] Intelligence: MISMATCH | Indexed: <other_dir> | Current: <dir>
  ⚠️  Intelligence Directory Mismatch Detected!
  ```
  Trigger automatic re-scan against current workspace before proceeding.
- **Status Reporting & Drift Banner:**
  - **LIVE:** If snapshot is valid and fresh, emit UX-2 standard status:
    `[superconductor] Intelligence: LIVE | Project: <name> | SHA: <sha7> | Age: <Xh>`
    With null guard: if `context?.driftBanner` is present, emit `context.driftBanner`.
  - **MISMATCH:** Emit UX-2 status line and mismatch warning banner as defined above.
  - **NONE:** If `RepoContext` is `null` or snapshot is missing, emit UX-2 standard status:
    `[superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project`
    Proceed with keyword heuristics only.
- **Drift Banner Null Guard:** Always guard before accessing `context.driftBanner` (`if (context && context.driftBanner)`). Never dereference `context.driftBanner` when `RepoContext` is `null`.
- For each changed file with SAST findings in `RepoContext?.sastFindings`:
  - Inject finding summary into the `security-reviewer` context: `"LIVE SAST: <rule_id> at <file> — verify fix or document exception"`
- Pass `crossCuttingRisk` (files with hotspot_score > 15 AND SAST findings in `RepoContext`) to Arbiter briefing

Each reviewer receives:
- The resolved diff/code target
- Preflight Test Execution Evidence (`## Preflight Test Execution Evidence` block from `QuorumPreflightTestRunner`)
- Deterministic preflight output (or `"preflight: skipped - no tool detected"`)
- Their specialization prompt from `templates/reviewers/<role>-reviewer.md`
- **No** `spec.md`, **no** `plan.md` context (unless `--pr` mode, where PR description is used)

### 5.3 Plan-Gap Protocol (when plan.md is available)

If a `plan.md` or spec file is found in the target directory (or provided via `--pr` PR description), the Adversarial reviewer MUST additionally run the **Plan-Gap Protocol** before finalizing its findings:

**Step 1 — AC Verification:**
```bash
# Identify what files the plan said should exist/change
grep -E '\- \[ \]|\- \[x\]' plan.md | grep -i 'write\|create\|add\|implement'
```
For each required file or behaviour: verify it exists and is non-empty.

**Step 2 — File Change Verification:**
```bash
# Were the right files actually changed?
git diff <baseline>..<head> --name-only
# Cross-reference against plan deliverables
```
- 🔴 **[blocking] Phase Omission:** Flag if a file the plan said MUST be modified has the same hash as before implementation.

**Step 3 — Test Coverage Ratio:**
```bash
grep -c 'Test:' plan.md 2>/dev/null || echo 0    # tests planned
find . -name '*.test.*' -o -name '*.spec.*' | xargs grep -c 'assert\|expect\|test\|it(' 2>/dev/null | awk -F: '{s+=$2}END{print s}'  # tests implemented
```
- 🔴 **[blocking]:** Test coverage < 50% of planned test surface.
- 🟡 **[important]:** Test coverage 50–80% of planned test surface.

**Step 4 — Named Test Case Verification (Shenanigan #12):**

This step is **execution-required** — not a reading step.

```bash
# Extract every named test case from the plan
grep -n 'Test:' plan.md

# For each Test: line, search test files for a test exercising that specific path
# Do NOT just check counts match — check each named path is explicitly covered
grep -rn '<key term from Test: line>' tests/
```

For each named test case NOT found: write a 5-line scratch script to verify the actual implementation behavior matches plan intent. If behavior diverges from the plan's stated expectation — this is a spec violation regardless of whether tests pass.

**Failure pattern to prevent (Shenanigan #12 + #11 combined):** Plan names `Test: N=1 reviewer → not unanimous`. All existing tests use N=3. Reviewer reads the count (14 tests = "sufficient") and declares clean pass. N=1 path never run. Spec violation survives all reviews.

**Step 5 — Boundary Value Execution (Shenanigan #13):**

For every function accepting a numeric count, ratio, divisor, or cost:
- Execute with `N=0` — confirm gate logic does not produce false confidence
- Execute with negative value — confirm formulas do not produce absurd output
- Execute with `N=1` — confirm single-item edge cases are semantically correct

**Step 6 — Verdict Certification Block (mandatory):**

Your final report MUST include:
```markdown
## Execution Evidence
- [x] §8.1 Worst-input set executed for: <functions>
- [x] §9.2 Boundary values executed for: <numeric params>
- [x] Named test cases from plan.md: <N> planned, <N> found, <N> missing
- Terminal output: [pasted inline above]
```
A report without this block is a reading-only review. Its verdict is voided under Shenanigan #11.

---

## 6.0 OUTPUT PROTOCOL

1. **Report file:** Write to `./review-<YYYYMMDD-HHMMSS>.md` in the current working directory
2. **Report structure:**
   ```markdown
   # Review Report — <target> — <timestamp>
   ## Summary
   ## Critical Findings
   ## High Findings
   ## Medium Findings
   ## Low / Advisory
   ## Coverage Report
   ## [Token Efficiency Report] (if --stats)
   ```
3. **Self-Check Verification:** Immediately after writing the report, you MUST run:
   ```bash
   npx -y tsx "${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/review-self-check.ts" <report-path>
   ```
   - If the script fails (exit code > 0): Announce the failure reason to the user, instruct them to resolve it (e.g., by actually executing edge cases and pasting evidence), and request a re-run. Do not output final success message.
   - **Bypass Path:** If you are intentionally skipping the self-check (e.g., for automated runs), pass `--skip-self-check` to input resolution, which skips this verification.
4. **Exit code:**
   - `0` — no findings or findings are advisory only
   - `1` — findings present (medium or high severity)
   - `2` — critical security findings present (pipeline must block)
5. **Announce:** After writing the report and passing the self-check, output the path to the user:
   > "Review complete. Report written to: `./review-<timestamp>.md`"
6. **POST-REVIEW HAND-OFF:** After emitting findings, execute the Swarm Remediation Protocol defined in §9.0 if any of: `--remediate` flag present, `--headless` + findings ≥ HIGH severity, or user confirms when prompted.

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

## 8.0 IMPLEMENTATION STATUS

The review pipeline is fully operational with FSM state machine persistence (`packages/quorum-fsm`), `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/quorum-review.ts` quorum loop, zero-bias re-run context builder, `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/domain-scorer.ts`, and `${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/codebase-review-orchestrator.ts`.

## 9.0 SWARM REMEDIATION PROTOCOL

### 9.1 Autonomous Remediation Loop & Post-Review Hand-Off
- When the review pipeline emits its findings report, or when `--remediate` / `--branch` is invoked:
  1. **Stop immediately if green (`RESOLVED`):** If zero unresolved findings exist, Quorum passes immediately and gates Oracle merge.
  2. **Remediate if red (`NEEDS_FIXES`):** If any non-advisory findings are present, the Autonomous Remediation Engine automatically groups findings by domain and dispatches parallel domain remediators in isolated worktrees.
  3. **Re-Review Quorum:** Upon applying fixes, a fresh zero-bias Quorum panel re-reviews the entire updated diff.
  4. **Continuous Loop Until 100% Green:** The cycle repeats (Quorum → Remediation → Quorum) until 100% green or the circuit breaker trips.
- In `--fast` mode: remediation offer skipped unless `--remediate` flag is explicit.
- In `--headless` mode: auto-launches remediation for CRITICAL or HIGH findings.
- `--remediate` flag always forces launch regardless of mode.

### 9.2 Domain Grouping & Parallel Dispatch

| Domain | Scope Patterns | Domain Agent |
|--------|----------------|--------------|
| `security` | `auth/`, `security/`, `middleware/`, `session/`, `jwt/`, `credentials/` | `security-remediator` |
| `logic` | `src/logic/`, `services/`, `controllers/`, `handlers/`, `core/` | `logic-remediator` |
| `tests` | `test/`, `tests/`, `__tests__/`, `*.spec.*`, `*.test.*` | `test-writer` |
| `types` | `types/`, `*.d.ts`, `interfaces/` | `types-remediator` |
| `config` | `config/`, `*.json`, `*.yaml`, `*.yml`, `*.toml` | `config-remediator` |
| `frontend` | `ui/`, `components/`, `pages/`, `styles/` | `frontend-remediator` |
| `ux-review` / `ux` | `commands/`, `skills/`, CLI output, prompts, error copy | `ux-remediator` |
| `schema` | `db/`, `models/`, `migrations/`, `repository/` | `schema-remediator` |
| *(unclassified)* | Any uncategorized files | `general-remediator` |

Note: Findings sharing the same domain are BATCHED to a single live agent and dispatched in parallel via the `DomainSplitRemediationDispatcher`. Worktree isolation is enforced for all concurrent remediators. Custom overrides via project-level `domain-map.json`.

### 9.3 Remediation FSM Lifecycle

```text
INIT → REVIEWING → NEEDS_FIXES → REMEDIATING → VERIFYING → PASSED (all green)
                         ↖─────────────────────────↙ (re-review finds issues)
                         ↘ MAX_CYCLES_EXCEEDED (3-5 cycles) → Deep Research Escalation → HALTED
                         ↘ STAGNANT_DIFF → HALTED
```
- Orchestrator spawns once and stays alive for entire cycle (context-preserving)
- Domain agents are subagents under the orchestrator running in isolated git worktrees
- SenderID verified on all agent-to-agent messages

### 9.4 Fresh Review Gate Protocol
- After each domain batch remediation: a FRESH review swarm is spawned
- Fresh swarm receives ONLY: `{ fingerprint: { severity, ruleId, file }, diff, preflightOutput }`
- Prior reviewer reasoning is NEVER passed (zero-bias enforcement)
- Fresh reviewers must emit `json:review-findings` block
- Status `RESOLVED` (empty findings) → finding is cleared; any remaining findings → next remediation cycle

### 9.5 Circuit Breaker & Deep Research Escalation Protocol
- **Circuit breaker:** Hard cap of 3–5 cycles or instant trip on `STAGNANT_DIFF`.
- **Deep Research Escalation:** When circuit breaker is reached, unresolved findings and error traces are automatically escalated to Deep Research.
- Request payload: finding + code context + error messages + prior fix diffs.
- Research result is wrapped in `<DEEP_RESEARCH_RESULT>...</DEEP_RESEARCH_RESULT>` delimiter tags (prompt injection defense).
- Classification:
  - `auto-applicable`: concrete code fix suggested → final remediation attempt
  - `policy-decision-required`: architectural/compliance/security policy → HUMAN_REQUIRED path
- Policy keywords: 'breaking change', 'architectural', 'compliance', 'CVE', 'security policy', 'requires migration', 'deprecation'

### 9.6 Observability & Audit Trail

`remediation_log.md` format:
```markdown
<Remediation Log — <target> — <timestamp>>
## Finding: <id>
- Domain: <domain>
- Agent: <agent_id>
- Attempts: <N>
- Deep Research Called: yes|no
- Outcome: RESOLVED | ESCALATED | HUMAN_REQUIRED
- Fix SHA: <commit_sha>
```
- Written alongside the review report
- Token usage appended at end when `--stats` flag used

### 9.7 Flag Compatibility Matrix

| Flag | Behaviour |
|------|-----------|
| `--fast` | Remediation offer skipped (use `--remediate` to override) |
| `--remediate` | Force-launch Swarm Remediation Engine |
| `--deep` | Enable deep analysis pass before domain dispatch |
| `--headless` | Auto-launch remediation for CRITICAL/HIGH findings |
| `--stats` | Append token usage breakdown to remediation_log.md |

## 10.0 QUORUM ENFORCEMENT

All track integration and finalization operations MUST pass through the `QuorumValidator`. The standard panel requires the following 5 distinct reviewer roles to grant a clean pass before merge:
- `security-reviewer`
- `correctness-reviewer`
- `adversarial-reviewer`
- `regression-reviewer`
- `ux-reviewer`

## 11.0 WORKTREE ISOLATION

Parallel Flash processors (e.g. for domain remediation or phase generation) MUST run in fully isolated git worktrees to prevent shared singleton overwrite issues or dirty-state leaks. The `WorktreeIsolationManager` automatically allocates and releases `wt` (worktrunk) branches for each agent.

## 12.0 MODEL ROUTING RULES

Agents are dynamically routed to model tiers by the `ModelRoutingEnforcer`:
- **Pro Tier**: `superconductor-oracle`, `superconductor-dreamer`, any processor facing high complexity without isolation, or any escalated agent (failCount >= 2).
- **Flash Tier**: Standard isolated `superconductor-processor` and standard reviewers.
