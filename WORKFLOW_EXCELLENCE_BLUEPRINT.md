# Workflow Excellence Blueprint

## Anti-Patterns

### Lone-Wolf Commit
**Description:** A named anti-pattern where a finalization commit is made without completing the required validation loops.
**Detection Signature:** A commit with the message format `chore(superconductor): Mark track X as complete` or similar, that occurs *without* an immediately preceding successful Quorum → Remediate → Quorum loop where all 4 reviewers report `RESOLVED`.
**Correct Resolution:** Ensure the pipeline assembly-line properly blocks the finalization commit step. If detected, the track must be rolled back to the pre-commit state, and the Quorum phase must be re-run and pass before committing.
