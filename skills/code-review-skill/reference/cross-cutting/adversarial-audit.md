# Adversarial Audit Guide

> **When to use:** Activate this checklist *after* your standard line-by-line review.  
> Its purpose is to catch the subtle class of problems that look fine at first glance but conceal undefined paths, hollow test verdicts, and misleading plan completions — collectively called **shenanigans**.

---

## 1. Undefined Path Hunting

For every conditional block in the diff, actively search for its implicit branches:

### 1.1 Missing `else`
```
if <X is available / condition is met>:
    do Y
```
**Ask:** What happens when `X` is **not** available / condition is **not** met?

- Silent fallthrough — is it unambiguous from surrounding context? If not: 🔴 `[blocking]`
- Implicit failure — does the caller handle `undefined`/`null`/empty? If unchecked: 🔴 `[blocking]`
- Documented no-op — explicitly stated to skip? That's fine: ✅

### 1.2 Prerequisite + Shortcut Trap
Look for "fast-path" branches (headless mode, CI mode, auto-approve):

```
if headless_mode:
    do Y automatically  # ← what if Y's dependency is also absent?
```

Every shortcut must handle its own dependency chain. A missing dependency in a non-interactive path is worse than in an interactive one — there's no human to catch it.

### 1.3 The `else`-first Reading Technique
Deliberately read each `if/else` block from the **bottom** up. Bugs and undefined states cluster in the `else` clause and the fallthrough path, not in the happy path.

---

## 2. Plan / Task Integrity (False Positive Detection)

When reviewing a change that includes a completed task list (`plan.md`, checklist, changelog):

### 2.1 Verify Evidence is Genuine
For every task marked `[x]` / ✅:

| Task type | What to check |
|---|---|
| "Sync file to X" | Was the file actually modified? Or did the copy fail silently (`cp: same file`)? |
| "Run tests" | Is the passing output for **new** code, or a cached/pre-existing green build? |
| "Verify X" | Was it a real assertion, or just a `wc -l` surface-check that misses logic gaps? |
| "Deploy/publish" | Does a 422/409 "already exists" count as done? Check exit codes. |

### 2.2 Optimistic Task Closure Patterns
🟡 `[important]` — Flag when a task is marked done because the **command ran without error**, not because the **outcome was correct**:
- Symlink `ln -sf` already existed → same inode → no-op marked ✅
- Package publish returned 409 (already exists) → marked ✅
- Build succeeded but produced no artifact → marked ✅

### 2.3 Self-Referential Review
If the implementing agent is also the one marking tasks complete, apply extra scrutiny to every `[x]`. Self-review is the highest-risk scenario for optimistic closures.

---

## 3. Test Coverage Legitimacy

**"All tests passed" is not the same as "this change is tested."**

### 3.1 Count New Tests
```bash
git diff <range> --name-only | grep -E '\.(test|spec)\.'
```
If the diff adds branching logic but **zero new test files**: at minimum 🟡 `[important]`. For complex branching logic: 🔴 `[blocking]`.

### 3.2 Verify Existing Tests Were Updated
Run:
```bash
git diff <range> -- '*.test.*' '*.spec.*'
```
If no test files were modified, the passing suite proves the old code didn't break — not that the new code works correctly.

### 3.3 Hollow Test Detection
A test is **hollow** if it passes regardless of the implementation's correctness:
- Line count / file size assertions (passes even if logic is entirely wrong)
- Schema existence checks (passes even if schema is semantically broken)
- Import smoke tests (passes even if the module exports garbage)

For hollow tests: 🟡 `[important]` — note what the test *doesn't* catch and suggest a meaningful assertion.

---

## 4. "Recommended" / Default Bias Audit

Any time a prompt option, flag default, or UX label uses **"Recommended"** or is the pre-selected default:

| Question | If "No": Flag |
|---|---|
| Is the recommendation **context-sensitive** (not blanket)? | 🟢 `[nit]` add qualifier |
| Does the description explain **when** it's appropriate vs. overkill? | 🟡 `[important]` |
| Could a first-time user pick it blindly in an inappropriate context? | 🟡 `[important]` |
| Is the "heavier" option always recommended regardless of input size? | 🟡 `[important]` |

**Good pattern:**
```diff
- "Multi-Agent Swarm (Recommended)"
+ "Multi-Agent Swarm (Recommended for 5+ tasks)"
```

---

## 5. The Shenanigan Checklist

Run this before finalising your verdict:

| # | Check | What it catches |
|---|---|---|
| 1 | **Grade inflation** | Self-assigned 10/10 with open critical issues → 🔴 `[blocking]` override |
| 2 | **No-op task completions** | `cp: same file`, `ln: already exists`, 409 already-exists → 🟡 `[important]` |
| 3 | **Spec drift** | Read each acceptance criterion against the actual diff, not the commit message. Did implementation match AC verbatim or drift to something adjacent? |
| 4 | **Missing else** | Every `if` has an implicit `else` — is it defined? (§1.1) |
| 5 | **Self-referential verification** | Implementing agent reviewed its own work → extra scrutiny required |
| 6 | **Hollow tests** | Tests that pass regardless of correctness (§3.3) |
| 7 | **Optimistic closures** | Task marked done because command ran, not because outcome was verified (§2.2) |
| 8 | **Prerequisite + shortcut trap** | Fast-path branches that bypass checks also need to handle missing dependencies (§1.2) |

> **Living Document:** New patterns are automatically inducted into this table after every Superconductor Oracle run via the §7.0 Adversarial Audit Debrief (ABI) protocol. Each inducted row is annotated with a provenance comment: `<!-- Inducted: <track_id> — <date> — <trigger> -->`.

| # | Check | What it catches |
|---|---|---|
| 1 | **Grade inflation** | Self-assigned 10/10 with open critical issues → 🔴 `[blocking]` override |
| 2 | **No-op task completions** | `cp: same file`, `ln: already exists`, 409 already-exists → 🟡 `[important]` |
| 3 | **Spec drift** | Read each acceptance criterion against the actual diff, not the commit message. Did implementation match AC verbatim or drift to something adjacent? |
| 4 | **Missing else** | Every `if` has an implicit `else` — is it defined? (§1.1) |
| 5 | **Self-referential verification** | Implementing agent reviewed its own work → extra scrutiny required |
| 6 | **Hollow tests** | Tests that pass regardless of correctness (§3.3) |
| 7 | **Optimistic closures** | Task marked done because command ran, not because outcome was verified (§2.2) |
| 8 | **Prerequisite + shortcut trap** | Fast-path branches that bypass checks also need to handle missing dependencies (§1.2) |
| 9 | **Phase omission** | Implementation skips entire plan phases. Use `md5sum` or `git diff --name-only` to verify every file the plan said should be modified was actually changed. If hash is identical before/after → phase was skipped → 🔴 `[blocking]` | <!-- Inducted: review_panel_20260722 — 2026-07-23 — Phase 5 (swarm-orchestrate) was not touched despite being a required deliverable -->
| 10 | **Write-path/read-path split** | A module reads from a file that nothing in the diff writes to. The read-path is implemented but the write-path is missing. Check every `fs.readFileSync` or equivalent for a corresponding write hook. → 🔴 `[blocking]` | <!-- Inducted: review_panel_20260722 — 2026-07-23 — generate-token-report.ts reads token-report.json, but no script writes to it -->
| 11 | **Reading-only review (execution bypass)** | A reviewer declares a clean pass after reading code without running a single edge case against it. A reading comprehension pass is not a code review. **Mandate:** For every non-trivial function, execute §8 worst-input set before approving. Declaring clean pass without execution evidence: 🔴 `[blocking]` override. | <!-- Inducted: review_panel_20260722 — 2026-07-23 — v4 review declared "100% compliant" without executing any edge cases; v5 execution found 3 defects -->
| 12 | **Named test case omission** | The plan specifies a test by name (e.g., `Test: N=1 reviewer → not unanimous`), but no test in the suite exercises that exact path. Test count matching is insufficient — each *named* test case in the plan is a contract. Missing named test: 🟡 `[important]`. Named test for a security/gate path: 🔴 `[blocking]`. | <!-- Inducted: review_panel_20260722 — 2026-07-23 — plan.md L104 specified N=1 reviewer test; all gate tests used N=3; path never exercised -->
| 13 | **Zero/boundary-value guard omission** | Functions that accept counts, totals, or divisors (e.g., `totalReviewersCount`, `cost_usd`) lack guards for zero or negative inputs. When `N=0`, arithmetic comparisons invert semantics silently (e.g., `agreement_count < 0` is always false → phantom unanimous gate). **Check:** every numeric parameter that drives a gate or calculation. | <!-- Inducted: review_panel_20260722 — 2026-07-23 — totalReviewersCount=0 caused any finding to appear unanimously agreed; negative cost_usd produced ~8,417,600% savings -->

---

## 6. Severity Mapping

Use the standard severity labels from the Code Review Skill:

| Finding type | Default severity |
|---|---|
| Undefined path — ambiguous to caller | 🔴 `[blocking]` |
| Missing else — silent and load-bearing | 🔴 `[blocking]` |
| Headless shortcut + missing dependency | 🔴 `[blocking]` |
| Plan phase omission (file unchanged despite plan) | 🔴 `[blocking]` |
| Write-path missing for an implemented read-path | 🔴 `[blocking]` |
| Logic inversion on gate/routing condition | 🔴 `[blocking]` |
| Reading-only review with clean-pass verdict | 🔴 `[blocking]` override |
| Named test case from plan not exercised | 🟡 `[important]` → 🔴 if gate/security path |
| Zero/boundary guard missing on numeric parameter | 🟡 `[important]` |
| No new tests for branching logic | 🟡 `[important]` |
| Hollow test | 🟡 `[important]` |
| No-op task marked done | 🟡 `[important]` |
| Test coverage below 50% of plan's specified test surface | 🔴 `[blocking]` |
| Test coverage 50–80% of plan's specified test surface | 🟡 `[important]` |
| Blanket "Recommended" label | 🟢 `[nit]` → 🟡 if UX-critical |
| Grade inflation | Override to match actual findings |

---

## 7. Plan-Gap Protocol

> **Trigger:** Use this protocol whenever the code being reviewed was built from a `plan.md`, spec, or task list. It must run **before** the shenanigan checklist.

A review that only reads the code and describes what it does is a **reading comprehension exercise, not a code review.** The Plan-Gap Protocol forces the reviewer to cross-reference *what was supposed to be built* against *what was actually built*.

### 7.1 Acceptance Criteria Verification

For every AC in the spec or plan:

1. Identify the specific code/file/behaviour that satisfies the AC.
2. Verify it exists. Don't trust the commit message — find the line of code.
3. Mark each AC: ✅ (satisfied), ❌ (not implemented), ⚠️ (partial).
4. If more than 25% of ACs fail: verdict is automatically 🔴 `NEEDS FIXES`.

```bash
# Quick check: did the files the plan mentioned actually get changed?
git diff <before>..<after> --name-only
```

### 7.2 File-Level Change Verification

For every file the plan said would be created or modified:

```bash
# Confirm the file was actually changed, not just mentioned
md5sum <file>                      # compare before/after hashes
git log --oneline -- <file>        # confirm a commit touched it
git show HEAD~N:<file> | md5sum    # hash as of N commits ago
```

If a file's hash is identical to pre-implementation: the plan task was **skipped**. This is 🔴 `[blocking]` regardless of whether tests pass.

### 7.3 Test Plan Verification

The plan's test specifications are a contract, not suggestions:

```bash
# How many tests were planned vs. how many exist
grep -c 'Test:' plan.md                          # planned
grep -c 'assert\|test\|it(\|describe(' tests/*.test.*  # implemented
```

Coverage ratio below 50%: 🔴 `[blocking]`. Below 80%: 🟡 `[important]`.

Also verify that the plan's specific **named test cases** exist — not just that *some* tests were written. If the plan says `Test: zero findings → CanSkipArbiter: true` and no test exercises that path, that is a hollow test coverage claim regardless of what the total count shows.

---

## 8. Edge Case Execution Protocol

> **Trigger:** Use this protocol for every non-trivial function in the diff. Run it mentally or with a scratch script.

A reviewer who only reads the happy path will miss the most dangerous bugs. Edge cases cluster in the inputs the implementor never tested.

### 8.1 The Worst-Input Set

For every function, mentally execute it against this input set before approving:

| Input class | Example | What breaks |
|---|---|---|
| Empty collection | `[]`, `{}`, `""` | Array operations, reduce, first/last |
| Null / undefined | `null`, `undefined`, `None` | Dereference, method calls |
| Non-numeric string where number expected | `"all"`, `"N/A"`, `""` | `parseInt`, `parseFloat`, comparisons → `NaN` |
| Zero | `0`, `0.0` | Division, falsy checks conflating 0 with false, gate conditions |
| Negative | `-1`, `-Infinity` | Array indices, loop bounds |
| Single element | `[x]` | Off-by-one, first/last conflation |
| Max / overflow | `Number.MAX_SAFE_INTEGER` | Integer overflow, allocation |
| Concurrent / repeated call | call twice simultaneously | Race conditions, double-write |

### 8.2 The Logic Inversion Test

For every boolean condition that gates an expensive or consequential action:

1. Identify what happens when the condition is `false` (the else-path).
2. Ask: **does the else-path do the right thing?**
3. Specifically check for **inverted semantics**: where the condition accidentally makes the expensive path trigger on the *common* case.

```
Bug pattern: can_skip = condition && length > 0
Inversion:   length == 0 (clean/empty case) → can_skip = false → triggers expensive path
Correct:     length == 0 IS the clean pass — should also skip the expensive path
```

### 8.3 The Write-Path / Read-Path Split Test

For every `fs.readFile`, database read, cache lookup, or file parse introduced in the diff:

1. Find where the data it reads is **written** — in this diff, or in existing verified code.
2. If the write is absent: 🔴 `[blocking]` — the read will always find an empty or stale source.

```bash
grep -r "readFileSync\|readFile" scripts/  # find all read sites
grep -r "writeFileSync\|writeFile" scripts/ # find all write sites
# Every read path must have a corresponding write path
```

### 8.4 Resource Safety

For every blocking call (network, disk, subprocess, `execSync`):

| Check | If missing |
|---|---|
| **Timeout** | Can hang indefinitely — 🔴 `[blocking]` in headless/swarm contexts |
| **Error handler** | Silent failures — Shenanigan #8 (Silent Degradation) |
| **Resource cleanup** | File descriptors, connections, child processes not closed |

---

## 9. Mandatory Execution Verification Protocol

> **Trigger:** Before issuing *any* clean-pass or APPROVED verdict. This protocol is mandatory — skipping it is itself a blocking finding (Shenanigan #11).

A clean-pass verdict issued without code execution is **grade inflation by definition**. Reading code and describing what it does is a reading comprehension exercise. This section defines the minimum execution evidence required before a verdict is issued.

### 9.1 Required Execution Evidence

For every non-trivial function in the diff, you MUST produce one of the following before approving:

| Evidence type | How to produce |
|---|---|
| **Scratch script output** | Write a `/tmp/edge_test.ts` (or `.py`, `.go`) that imports the function and runs the §8.1 worst-input set. Paste the terminal output into the review. |
| **Test suite run** | Run the existing test suite (`npx tsx tests/*.test.ts` or equivalent). Paste the output. Passing tests alone are insufficient — also execute the §8 inputs the tests don't cover. |
| **Inline trace** | For small pure functions: trace execution with concrete values written into the review body. Must show actual computed values, not just intent. |

**A review that contains no terminal output, no computed values, and no executed traces has not been executed. It must be rejected and re-run.**

### 9.2 Boundary Value Mandatory Set

For any function accepting a numeric count, total, divisor, or index, execute these before approving:

```bash
# Script template — adapt to language
echo "Zero input:" && run_fn(0)
echo "Negative input:" && run_fn(-1)
echo "Single item:" && run_fn(1)
echo "Max/boundary:" && run_fn(MAX_SAFE_INTEGER)
```

Specific patterns to check:
- **`count < N` gate logic:** test with `N=0` and `count=0` separately. Confirm the "no reviewers ran" state escalates, not skips.
- **Savings/cost formulas:** test with negative input. Confirm the formula does not produce absurd positive savings from a negative cost.
- **`parseInt` on string values:** test `"all"`, `""`, `undefined`, `"N/A"`. Confirm NaN is explicitly handled, not silently compared.

### 9.3 Named Test Case Verification (Plan-Gap Execution Check)

When reviewing code built from a `plan.md`, this is a required execution step — not an optional reading step:

```bash
# 1. Extract all named test cases from the plan
grep -n "Test:" plan.md

# 2. For each Test: line, search the test suite for a test exercising that exact path
grep -rn "<key phrase from Test: line>" tests/

# 3. If no match found — write and run the missing test yourself in a scratch script
#    to confirm whether the implementation behavior matches plan intent
```

**Failure mode to prevent:** N=1 reviewer is named in plan.md → all existing tests use N=3 → reviewer assumes the test count is sufficient → N=1 path is never executed → spec violation goes undetected for multiple review rounds.

### 9.4 Verdict Certification

A verdict of APPROVED or CLEAN PASS MUST include the following certification block:

```
## Execution Evidence
- [x] §8.1 Worst-input set executed for: <list of functions>
- [x] §9.2 Boundary values executed for: <list of numeric parameters>
- [x] §9.3 Named test cases from plan.md verified: <count> planned, <count> found, <count> missing
- Terminal output: [pasted or linked]
```

A review report without this block — or with this block left blank — is considered a reading-only review and its verdict is automatically voided.
