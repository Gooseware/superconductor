# Adversarial Execution Quorum Dogma

## Problem Statement
This dogma addresses a critical failure mode in standard quorum reviews: Reviewers raising speculative, subjective, or purely visual findings that lead to implementation churn, while simultaneously missing secondary regressions in fix diffs. To ensure high-signal, actionable feedback, all review findings must now be grounded in execution and verifiable proofs.

## Core Reviewer Mandates

### 1. Mandatory Execution Reproductions
Reviewers are strictly PROHIBITED from raising blocking findings based solely on visual inspection. 
Every blocking finding must include an ephemeral reproduction script (TypeScript/Node or bash).
- The script must be executed in an isolated worktree via `worktrunk` (`wt`).
- The execution must complete within 30 seconds.
- The script must produce real runtime error traces or observable failure outputs.

### 2. End-to-End Lifecycle Tracing
Reviewers must trace data continuously across domain seams. Analysis must cover the full lifecycle:
`Ingestion -> DB Transaction -> RPC/Gateway -> Store Hydration -> UI Component`
- Column or schema removals MUST be verified against all downstream query consumers to prevent silent breakages.

### 3. Diff-on-Diff Scrutiny
On remediation cycles >= 2, reviewers must explicitly inspect `git diff HEAD~1..HEAD` to audit the previous remediator's changes.
- Look for secondary flaws introduced by the fix.
- Identify unintended file modifications.
- Flag swallowed errors or overly broad exception handling introduced in the remediation.

### 4. Mock Elimination
Reviewers must actively detect and flag test suites that engage in test theatre:
- Mocking the primary component or unit under test.
- Testing against outdated schemas or mock data that doesn't match the current types.
- Pre-seeding state to mask uninitialized fields or initialization lifecycle bugs.

## Crafting Isolated Worktree Reproduction Scripts

When authoring a reproduction script, use the following boilerplate and standards:

1. **Isolation**: Always execute within a `worktrunk` managed environment to avoid polluting the primary workspace.
2. **Speed**: Scripts must be designed to fail fast (<30s).
3. **Failure Output Tagging**: Explicitly tag the failure output so it can be automatically parsed by the remediation engine. Use `[REPRO_FAILURE_START]` and `[REPRO_FAILURE_END]`.

### TypeScript Boilerplate Example

```typescript
// repro.ts
import { execSync } from 'child_process';

async function runRepro() {
  try {
    // 1. Setup isolated state if necessary
    // 2. Invoke the target function/component
    // 3. Assert expected state
    throw new Error("Expected state not met: details...");
  } catch (err) {
    console.error("[REPRO_FAILURE_START]");
    console.error(err);
    console.error("[REPRO_FAILURE_END]");
    process.exit(1);
  }
}
runRepro();
```

## Reviewer Finding JSON Schema

All findings must conform to the following JSON schema, explicitly requiring execution proof for blocking issues.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "severity": {
      "type": "string",
      "enum": ["BLOCKING", "NON_BLOCKING"]
    },
    "description": {
      "type": "string",
      "description": "Clear explanation of the issue."
    },
    "domain": {
      "type": "string",
      "description": "The architectural domain (e.g., Database, UI, API)."
    },
    "repro_script": {
      "type": "string",
      "description": "The full source code of the ephemeral reproduction script."
    },
    "execution_proof": {
      "type": "string",
      "description": "The actual runtime error trace or output demonstrating the failure."
    }
  },
  "required": ["severity", "description", "domain"],
  "allOf": [
    {
      "if": {
        "properties": { "severity": { "const": "BLOCKING" } }
      },
      "then": {
        "required": ["repro_script", "execution_proof"]
      }
    }
  ]
}
```
