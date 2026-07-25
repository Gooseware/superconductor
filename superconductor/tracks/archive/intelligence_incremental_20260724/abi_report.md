# ABI Debrief Report: `intelligence_incremental_20260724`

## 1. Adversarial Reviewer Pattern (`adversarial-reviewer/SKILL.md`)
**Transient State Resets & Unpersisted In-Memory Mutations**
- **Pattern:** Mutating state in memory (e.g., resetting counters like `manifest.incrementalRuns = 0`) before an early return without persisting the update to disk.
- **Impact:** Causes infinite rescan loops and state desynchronization across process runs.
- **Review Check:** Verify every state mutation in early-exit branches is written to persistent storage before returning.

## 2. Security Reviewer Pattern (`security-reviewer/SKILL.md`)
**Shell String Interpolation of Dynamic Variables in Subprocess Execution**
- **Pattern:** Using `execSync` with template literal interpolation (`execSync(\`git log \${lastSha}..HEAD\`)` or `execSync(\`ctags \${files}\`)`) rather than parameterized argument arrays.
- **Impact:** Shell injection vulnerability when paths, SHAs, or manifest fields contain shell metacharacters or attacker-controlled input.
- **Review Check:** Require `spawnSync` / `execFileSync` with explicit argument arrays, paired with strict validation (e.g. hex SHA regex, `path.resolve` boundary check).

## 3. Coding Agent Improvement (`coding-agent/SKILL.md`)
**Schema-Aware Merge Guards & Empirical On-Disk Verification**
- **Improvement:** Coding agents must verify exact JSON target schema types (array vs object/graph) before applying generic array merges (`mergeIntoJson`), and write integration tests that assert actual on-disk data content mutation rather than relying on in-memory call counts or temporary file cleanup.
