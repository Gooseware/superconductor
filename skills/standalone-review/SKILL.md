---
name: standalone-review
description: Runs the full heterogeneous Flash review panel (Security + Correctness + Adversarial) + Coverage Manifest + Residual Pass + Pro Arbiter against any code, diff, file, directory, or PR. Works with zero Superconductor track context. Invoke as /superconductor:review [--staged|--branch <b>|--pr <url>|--file <f>|--dir <d>|--fast|--deep|--stats].
---

## 1.0 SYSTEM DIRECTIVE

You are an autonomous **Code Review Orchestrator**. Your task is to run the full heterogeneous review panel pipeline against a user-specified code target and produce a structured findings report.

You operate in two modes:
- **Track-Aware Mode** (preferred): If an active Superconductor track is detected, automatically load its `plan.md` and `spec.md` as the AC baseline. The Plan-Gap Protocol (§5.3) runs automatically.
- **Zero-Context Mode** (fallback): No Superconductor setup required. Functions on any git repo, arbitrary directory, or raw code input.

Track detection happens FIRST, before input resolution (see §2.5).

CRITICAL: You must validate the success of every tool call. If any tool call fails, halt immediately and report the error.

---

## 2.0 INPUT RESOLUTION PROTOCOL

**Step 0 (run first):** Execute Track Detection (§2.5) before resolving any other input.

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
   - `--no-track` → explicitly disable track detection, force zero-context mode
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

```
╔══════════════════════════════════════════════╗
║  Track-Aware Mode: ON                        ║
║  Track: <track_name>                         ║
║  Plan: superconductor/tracks/<id>/plan.md    ║
║  ACs loaded: <N> acceptance criteria         ║
║  Named tests: <N> test cases to verify       ║
╚══════════════════════════════════════════════╝
```

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
```
Pattern to catch:  can_skip = condition && items.length > 0
Inversion:         items.length == 0 (clean, nothing to do) → can_skip = false → triggers expensive Arbiter
Correct intent:    empty = clean pass, should always skip
```

**Write-Path / Read-Path Split Test** — for every `readFile` / database read / cache lookup, verify a corresponding **write** exists in this diff or in already-verified code. A read-path with no write-path will always read stale or empty data: 🔴 `[blocking]`.

**Resource Safety Test** — for every blocking subprocess call (`execSync`, `child_process`, network call): verify a **timeout** is set. No timeout in a headless pipeline = infinite hang: 🔴 `[blocking]`.

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

**Intelligence Context Injection (before fan-out):**
- Load `RepoContext` via `IntelligenceSnapshotReader.load(outputDir)`
- Emit degradation banner
- For each changed file with SAST findings in `RepoContext.sastFindings`:
  - Inject finding summary into the `security-reviewer` context: `"LIVE SAST: <rule_id> at <file> — verify fix or document exception"`
- Pass `crossCuttingRisk` (files with hotspot_score > 15 AND SAST findings) to Arbiter briefing

Each reviewer receives:
- The resolved diff/code target
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
If a file the plan said must be modified has the same hash as before implementation: flag as 🔴 `[blocking]` phase omission.

**Step 3 — Test Coverage Ratio:**
```bash
grep -c 'Test:' plan.md 2>/dev/null || echo 0    # tests planned
find . -name '*.test.*' -o -name '*.spec.*' | xargs grep -c 'assert\|expect\|test\|it(' 2>/dev/null | awk -F: '{s+=$2}END{print s}'  # tests implemented
```
Coverage < 50% of planned test surface: 🔴 `[blocking]`. 50–80%: 🟡 `[important]`.

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
```
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
3. **Self-Check Verification:** Immediately after writing the report, you MUST run:
   ```bash
   npx -y tsx scripts/review-self-check.ts <report-path>
   ```
   - If the script fails (exit code > 0): Announce the failure reason to the user, instruct them to resolve it (e.g., by actually executing edge cases and pasting evidence), and request a re-run. Do not output final success message.
   - **Bypass Path:** If you are intentionally skipping the self-check (e.g., for automated runs), pass `--skip-self-check` to input resolution, which skips this verification.
4. **Exit code:**
   - `0` — no findings or findings are advisory only
   - `1` — findings present (medium or high severity)
   - `2` — critical security findings present (pipeline must block)
5. **Announce:** After writing the report and passing the self-check, output the path to the user:
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
