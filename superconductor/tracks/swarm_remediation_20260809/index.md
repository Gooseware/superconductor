# Track: swarm_remediation_20260809

## Standalone Review — Swarm Remediation Engine

| Property | Value |
|----------|-------|
| **Type** | Feature |
| **Status** | `[ ]` Planned |
| **Branch** | `track/swarm_remediation_20260809` |
| **Target** | `main` |
| **Created** | 2026-08-09 |

## Files

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Metadata](./metadata.json)

## Summary

Adds a domain-specialized **Swarm Remediation Engine** to the standalone review system. After the review pipeline emits findings, a context-preserving remediation swarm is spawned with domain agents assigned by file-path heuristics (`auth/*` → security-remediator, `ui/*` → frontend-remediator, etc). Exhausted retry budgets escalate to the Deep Research team. Fresh zero-bias re-review gates validate each fix before merge.

## Key Components

- `DomainClassifier` — file-path → domain agent mapping
- `RemediationOrchestrator` — stateful FSM lifecycle manager
- `BiasIsolatedReviewGate` — fresh, context-stripped re-review
- `DeepResearchEscalationHandler` — deep research integration on retry exhaustion
- `RemediationLogWriter` — audit trail and token observability
- `standalone-remediation` skill — standalone invocation from any review report
- `standalone-review` SKILL.md §9.0 extension

## Dependencies

- `deep_research_integration_20260728` (merged to main)
- `standalone-review` SKILL.md (existing)
