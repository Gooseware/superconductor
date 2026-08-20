# Superconductor: Recommended Fixes & Architecture Improvements

## 1. Executive Summary & Problem Diagnosis

During review quorum execution (e.g., via `/superconductor:standalone-review` or `/superconductor:review`), a critical behavioral issue occurs:

### The Symptom
The orchestrating model performs the code review, boundary checks, and report generation **in-process within its own single-agent context**, rather than spawning the expected 4-agent heterogeneous review swarm (**Security Reviewer**, **Correctness Reviewer**, **Adversarial Reviewer**, and **Regression Reviewer**). The user observes a single script run and a summary report without seeing any subagents active in the IDE or UI.

---

## 2. Root Cause Analysis

### Root Cause 1: Permissive Language in Skill Fallback Protocols
In `skills/standalone-review/SKILL.md` (and similar review skills):
- **Section §4.2 (Manual Orchestration Protocol)** states:
  > *"If the automated orchestration scripts (`scripts/quorum-review.ts`, etc.) are unavailable, you MUST manually execute the review pipeline: ... Manually dispatch the four reviewer roles (Security, Correctness, Adversarial, Regression) as subagents via send_message **or execute their roles directly in parallel**."*
- **Impact:** The phrase *"or execute their roles directly in parallel"* gives LLM orchestrators a loophole to "simulate" or execute the review roles internally in a single turn rather than invoking actual subagent tools (`invoke_subagent`). This bypasses subagent isolation and violates user expectations of a genuine multi-agent quorum.

### Root Cause 2: Assumption of Relative Path Scripts in User Repositories
The skill instructions explicitly command:
```bash
npx -y tsx scripts/quorum-review.ts
npx -y tsx scripts/review-self-check.ts <report-path>
```
- **Impact:** When Superconductor is used in standalone mode against an external/user repository (e.g., `hippos/hni`), these scripts do NOT exist at `./scripts/` in the user's project root. This immediate failure causes the LLM to trigger the flawed §4.2 fallback mentioned above.

### Root Cause 3: Lack of Bundled Plugin Script Resolution
Superconductor's review automation scripts reside inside the extension/plugin directory (`~/.gemini/config/plugins/superconductor/` or `/packages/superconductor-core/`), but the skill prompts reference paths relative to the current working directory (`./scripts/...`).

---

## 3. Recommended Fixes for the Superconductor Repository

### Fix 1: Eliminate In-Process Fallback & Mandate `invoke_subagent`
**Files to update:**
- `skills/standalone-review/SKILL.md`
- `skills/review/SKILL.md`
- `skills/swarm-orchestrate/SKILL.md`
- `skills/swarm-execute/SKILL.md`

**Required Prompt Refactor (§4.2):**
Replace §4.2 with strict, non-negotiable subagent dispatch rules:
```markdown
### 4.2 Subagent Quorum Dispatch Protocol (MANDATORY)

You MUST ALWAYS dispatch the 4 heterogeneous review roles as distinct concurrent subagents using the `invoke_subagent` tool. You are STRICTLY PROHIBITED from evaluating, simulating, or writing reviewer verdicts in-process within your own session.

Dispatch Call Pattern:
invoke_subagent({
  Subagents: [
    { TypeName: "superconductor-reviewer", Role: "Security Reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "Correctness Reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "Adversarial Reviewer", Prompt: "..." },
    { TypeName: "superconductor-reviewer", Role: "Regression Reviewer", Prompt: "..." }
  ]
})

Rule: NEVER conclude a quorum review until all 4 subagents have returned their independent verdicts.
```

---

### Fix 2: Absolute Script Path Resolution via Environment / Plugin Dir
**Issue:** `scripts/quorum-review.ts` and `scripts/review-self-check.ts` fail in projects without local Superconductor scripts.

**Solution:**
Update all script references in skill prompts and runners to resolve from either:
1. An environment variable / plugin location:
   ```bash
   npx -y tsx "${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/quorum-review.ts"
   ```
2. Or a global package binary:
   ```bash
   npx -y @superconductor/cli review --quorum
   ```

---

### Fix 3: Built-in Standalone Self-Check Fallback
**Issue:** If `review-self-check.ts` is missing, the agent either halts or bypasses the check.

**Solution:**
1. Package `review-self-check.ts` directly within `@superconductor/core` or the plugin distribution.
2. In the skill prompt, include a clean inline self-check rule when external scripts cannot be resolved, checking for:
   - Presence of `# Review Report`
   - Presence of `## Execution Evidence` with executed boundary blocks
   - Presence of all 4 reviewer signatures (`Security`, `Correctness`, `Adversarial`, `Regression`)

---

### Fix 4: Standardize JSON Output Extraction from Subagents
Ensure that each subagent is instructed to return its output enclosed in standard markdown blocks:
```markdown
```json:review-findings
[
  {
    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    "domain": "security" | "logic" | "tests" | "types" | "frontend",
    "file": "path/to/file.tsx",
    "line": 42,
    "description": "..."
  }
]
```
```
This guarantees the orchestrator can parse structured findings cleanly without hallucinating consensus.

---

## 4. Implementation Checklist for Superconductor Maintainers

- [ ] Update `skills/standalone-review/SKILL.md`: Remove *"or execute their roles directly in parallel"* and make `invoke_subagent` mandatory.
- [ ] Update `skills/review/SKILL.md`: Enforce subagent spawning for all track review phases.
- [ ] Update script paths in all SKILL.md files to resolve from `$PLUGIN_DIR/scripts/` instead of `./scripts/`.
- [ ] Ensure `superconductor-reviewer` subagent type definition is eagerly available in all sessions.
- [ ] Add unit/integration tests for the Superconductor skill parser ensuring no in-process short-circuiting occurs.
