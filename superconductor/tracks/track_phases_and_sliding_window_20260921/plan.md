# Implementation Plan: Track Phase System & Dynamic Sliding-Window Progression

## Overview
Implement a first-class Track Phase System in Superconductor that organizes tracks into milestone phases within `superconductor/tracks.md`, provides an interactive phase switcher (`/superconductor:phase`), enables phase-targeted batch execution with interactive continuation on failure, and dynamically renumbers phases using a sliding-window model when Phase 1 completes.

---

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 18 tasks)
**Estimated Track Token Budget:** ~0.7M tokens · ~$0.05 at Flash-Lite rates

### Adapter Suggestions

- **aggregate-findingsAdapter**: Favorable token economics (dependency surface size 14 < 50 for packages/superconductor-core/src/review/aggregate-findings.ts) allows generating an Adapter to encapsulate this functionality.
- **archive-managerAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/src/track/archive-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **learnAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/cli/learn.ts) allows generating an Adapter to encapsulate this functionality.
- **incubation-managerAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/learning/incubation-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **canary-harnessAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/learning/canary-harness.ts) allows generating an Adapter to encapsulate this functionality.
- **dogma-validatorAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/dist/learning/dogma-validator.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/cli/index.ts) allows generating an Adapter to encapsulate this functionality.
- **headlessAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/cli/headless.ts) allows generating an Adapter to encapsulate this functionality.
- **interactiveAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/cli/interactive.ts) allows generating an Adapter to encapsulate this functionality.
- **dag-resolverAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/dag-resolver.ts) allows generating an Adapter to encapsulate this functionality.
- **track-manifestAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/schema/track-manifest.ts) allows generating an Adapter to encapsulate this functionality.
- **snapshot-readerAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/dist/intelligence/snapshot-reader.ts) allows generating an Adapter to encapsulate this functionality.
- **dispatcherAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/cli/dispatcher.ts) allows generating an Adapter to encapsulate this functionality.
- **merge-trackAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/cli/merge-track.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-contextAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/protocol/agent-context.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/track/index.ts) allows generating an Adapter to encapsulate this functionality.
- **deterministic-preflightAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/review/deterministic-preflight.ts) allows generating an Adapter to encapsulate this functionality.
- **input-resolutionAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/review/input-resolution.ts) allows generating an Adapter to encapsulate this functionality.
- **execution-plannerAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/track/execution-planner.ts) allows generating an Adapter to encapsulate this functionality.
- **splicerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/context/splicer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-stateAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/permissions/track-state.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 9 < 50 for packages/superconductor-core/dist/intelligence/index.ts) allows generating an Adapter to encapsulate this functionality.
- **keyword-inferrerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/permissions/keyword-inferrer.ts) allows generating an Adapter to encapsulate this functionality.
- **model-chooser-dialogAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/models/model-chooser-dialog.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/learning/index.ts) allows generating an Adapter to encapsulate this functionality.
- **workspace-guardAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/orchestration/workspace-guard.ts) allows generating an Adapter to encapsulate this functionality.
- **sign-off-gateAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/dist/orchestration/sign-off-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/types/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/protocol/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/telemetry/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/schema/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/utils/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/orchestration/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/remediation/index.ts) allows generating an Adapter to encapsulate this functionality.
- **libsql-database-managerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/shared/libsql-database-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/models/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/swarm/index.ts) allows generating an Adapter to encapsulate this functionality.
- **note-writerAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/notebook/note-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **drift-monitorAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/intelligence/drift-monitor.ts) allows generating an Adapter to encapsulate this functionality.
- **resolve-project-rootAdapter**: Favorable token economics (dependency surface size 9 < 50 for packages/superconductor-core/dist/intelligence/utils/resolve-project-root.ts) allows generating an Adapter to encapsulate this functionality.
- **audit-reporterAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/audit-reporter.ts) allows generating an Adapter to encapsulate this functionality.
- **incremental-updaterAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/incremental-updater.ts) allows generating an Adapter to encapsulate this functionality.
- **pipelineAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/pipeline.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-blueprint-generatorAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/intelligence/swarm-blueprint-generator.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-checkAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/intelligence/preflight-check.ts) allows generating an Adapter to encapsulate this functionality.
- **cli-blueprintAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/cli-blueprint.ts) allows generating an Adapter to encapsulate this functionality.
- **cli-updateAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/intelligence/cli-update.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-analyzerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/dependency-analyzer.ts) allows generating an Adapter to encapsulate this functionality.
- **topography-mapAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/topography-map.ts) allows generating an Adapter to encapsulate this functionality.
- **fingerprintAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/runners/fingerprint.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-graphAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/runners/dependency-graph.ts) allows generating an Adapter to encapsulate this functionality.
- **complexityAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/runners/complexity.ts) allows generating an Adapter to encapsulate this functionality.
- **sastAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/runners/sast.ts) allows generating an Adapter to encapsulate this functionality.
- **symbol-extractionAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/runners/symbol-extraction.ts) allows generating an Adapter to encapsulate this functionality.
- **test-gapsAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/runners/test-gaps.ts) allows generating an Adapter to encapsulate this functionality.
- **package-surfaceAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/runners/package-surface.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-surfaceAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/runners/dependency-surface.ts) allows generating an Adapter to encapsulate this functionality.
- **graphifyAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/runners/graphify.ts) allows generating an Adapter to encapsulate this functionality.
- **tool-registryAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/intelligence/tool-registry.ts) allows generating an Adapter to encapsulate this functionality.
- **preflightAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/preflight.ts) allows generating an Adapter to encapsulate this functionality.
- **reportAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/report.ts) allows generating an Adapter to encapsulate this functionality.
- **prompt-generatorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/prompt-generator.ts) allows generating an Adapter to encapsulate this functionality.
- **pair-programmingAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/pair-programming.ts) allows generating an Adapter to encapsulate this functionality.
- **task-complexity-scorerAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/task-complexity-scorer.ts) allows generating an Adapter to encapsulate this functionality.
- **model-tier-routerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/intelligence/model-tier-router.ts) allows generating an Adapter to encapsulate this functionality.
- **parallelism-optimiserAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/intelligence/parallelism-optimiser.ts) allows generating an Adapter to encapsulate this functionality.
- **oracle-cadence-optimiserAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/intelligence/oracle-cadence-optimiser.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-surface-toolAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/dependency-surface-tool.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-partitionerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/domain-partitioner.ts) allows generating an Adapter to encapsulate this functionality.
- **auto-sync-engineAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/auto-sync-engine.ts) allows generating an Adapter to encapsulate this functionality.
- **language-profileAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/intelligence/utils/language-profile.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-phase-gateAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/review/swarm-phase-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **couplingAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/intelligence/runners/coupling.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-contextAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/intelligence/dependency-context.ts) allows generating an Adapter to encapsulate this functionality.
- **typesAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/intelligence/runners/types.ts) allows generating an Adapter to encapsulate this functionality.
- **token-budget-estimatorAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/telemetry/token-budget-estimator.ts) allows generating an Adapter to encapsulate this functionality.
- **templatesAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/learning/templates.ts) allows generating an Adapter to encapsulate this functionality.
- **deduplicatorAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/learning/deduplicator.ts) allows generating an Adapter to encapsulate this functionality.
- **harvesterAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/learning/harvester.ts) allows generating an Adapter to encapsulate this functionality.
- **invariant-synthesizerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/learning/invariant-synthesizer.ts) allows generating an Adapter to encapsulate this functionality.
- **promoterAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/learning/promoter.ts) allows generating an Adapter to encapsulate this functionality.
- **sanitizerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/learning/sanitizer.ts) allows generating an Adapter to encapsulate this functionality.
- **skill-distillerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/learning/skill-distiller.ts) allows generating an Adapter to encapsulate this functionality.
- **transcript-parserAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/learning/transcript-parser.ts) allows generating an Adapter to encapsulate this functionality.
- **typesAdapter**: Favorable token economics (dependency surface size 10 < 50 for packages/superconductor-core/dist/learning/types.ts) allows generating an Adapter to encapsulate this functionality.
- **model-catalog-serviceAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/models/model-catalog-service.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-config-writerAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/models/agent-config-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-config-model-resolutionAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/orchestration/agent-config-model-resolution.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-granularityAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/orchestration/swarm-granularity.ts) allows generating an Adapter to encapsulate this functionality.
- **background-task-monitorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/orchestration/background-task-monitor.ts) allows generating an Adapter to encapsulate this functionality.
- **checkpoint-orchestratorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/orchestration/checkpoint-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **abstract-gateAdapter**: Favorable token economics (dependency surface size 10 < 50 for packages/superconductor-core/dist/orchestration/abstract-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-gateAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/orchestration/preflight-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **quorum-validatorAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/orchestration/quorum-validator.ts) allows generating an Adapter to encapsulate this functionality.
- **worktree-isolation-managerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/orchestration/worktree-isolation-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **model-routing-enforcerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/orchestration/model-routing-enforcer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-lifecycle-wizardAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/orchestration/track-lifecycle-wizard.ts) allows generating an Adapter to encapsulate this functionality.
- **track-lifecycle-orchestratorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/orchestration/track-lifecycle-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **archive-managerAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/track/archive-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **sign-off-gateAdapter**: Favorable token economics (dependency surface size 17 < 50 for packages/superconductor-core/src/orchestration/sign-off-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **schemasAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/dist/permissions/schemas.ts) allows generating an Adapter to encapsulate this functionality.
- **engineAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/permissions/engine.ts) allows generating an Adapter to encapsulate this functionality.
- **prompterAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/dist/permissions/prompter.ts) allows generating an Adapter to encapsulate this functionality.
- **toml-providerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/permissions/providers/toml-provider.ts) allows generating an Adapter to encapsulate this functionality.
- **auditAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/permissions/audit.ts) allows generating an Adapter to encapsulate this functionality.
- **track-readerAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/track/track-reader.ts) allows generating an Adapter to encapsulate this functionality.
- **mcp-schemaAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/protocol/mcp-schema.ts) allows generating an Adapter to encapsulate this functionality.
- **deep-research-escalation-handlerAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/remediation/deep-research-escalation-handler.ts) allows generating an Adapter to encapsulate this functionality.
- **bias-isolated-review-gateAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/remediation/bias-isolated-review-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-classifierAdapter**: Favorable token economics (dependency surface size 9 < 50 for packages/superconductor-core/dist/remediation/domain-classifier.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-split-remediation-dispatcherAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/dist/remediation/domain-split-remediation-dispatcher.ts) allows generating an Adapter to encapsulate this functionality.
- **standalone-remediationAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/remediation/standalone-remediation.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-orchestratorAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/remediation/remediation-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-stateAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/remediation/remediation-state.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-log-writerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/remediation/remediation-log-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **quorum-remediation-loopAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/remediation/quorum-remediation-loop.ts) allows generating an Adapter to encapsulate this functionality.
- **extract-fenced-blockAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/dist/review/extract-fenced-block.ts) allows generating an Adapter to encapsulate this functionality.
- **input-sanitizerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/utils/input-sanitizer.ts) allows generating an Adapter to encapsulate this functionality.
- **aggregate-findingsAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/dist/review/aggregate-findings.ts) allows generating an Adapter to encapsulate this functionality.
- **serialize-topographyAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/review/serialize-topography.ts) allows generating an Adapter to encapsulate this functionality.
- **aggregate-coverageAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/review/aggregate-coverage.ts) allows generating an Adapter to encapsulate this functionality.
- **cascade-deferral-gateAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/review/cascade-deferral-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **generate-token-reportAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/review/generate-token-report.ts) allows generating an Adapter to encapsulate this functionality.
- **abiAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/abi.ts) allows generating an Adapter to encapsulate this functionality.
- **streaming-clientAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/streaming-client.ts) allows generating an Adapter to encapsulate this functionality.
- **playwright-harnessAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/playwright-harness.ts) allows generating an Adapter to encapsulate this functionality.
- **vision-oracleAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/vision-oracle.ts) allows generating an Adapter to encapsulate this functionality.
- **test-theatre-detectorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/review/test-theatre-detector.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-test-runnerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/review/preflight-test-runner.ts) allows generating an Adapter to encapsulate this functionality.
- **LanguagePersonaResolverAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/dist/swarm/LanguagePersonaResolver.ts) allows generating an Adapter to encapsulate this functionality.
- **LanguageAdapterAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/swarm/LanguageAdapter.ts) allows generating an Adapter to encapsulate this functionality.
- **anti-patternsAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/dist/swarm/anti-patterns.ts) allows generating an Adapter to encapsulate this functionality.
- **RemediatorPromptBuilderAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/swarm/RemediatorPromptBuilder.ts) allows generating an Adapter to encapsulate this functionality.
- **DynamicQuorumContextSplicerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/swarm/DynamicQuorumContextSplicer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-stateAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/track/track-state.ts) allows generating an Adapter to encapsulate this functionality.
- **plan-gap-checkerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/track/plan-gap-checker.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-authorizerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/dist/track/swarm-authorizer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-manifestAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/schema/track-manifest.ts) allows generating an Adapter to encapsulate this functionality.
- **learnAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/cli/learn.ts) allows generating an Adapter to encapsulate this functionality.
- **incubation-managerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/learning/incubation-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **canary-harnessAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/learning/canary-harness.ts) allows generating an Adapter to encapsulate this functionality.
- **dogma-validatorAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/learning/dogma-validator.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/cli/index.ts) allows generating an Adapter to encapsulate this functionality.
- **headlessAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/cli/headless.ts) allows generating an Adapter to encapsulate this functionality.
- **interactiveAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/cli/interactive.ts) allows generating an Adapter to encapsulate this functionality.
- **snapshot-readerAdapter**: Favorable token economics (dependency surface size 14 < 50 for packages/superconductor-core/src/intelligence/snapshot-reader.ts) allows generating an Adapter to encapsulate this functionality.
- **dag-resolverAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/intelligence/dag-resolver.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-contextAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/protocol/agent-context.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/track/index.ts) allows generating an Adapter to encapsulate this functionality.
- **deterministic-preflightAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/review/deterministic-preflight.ts) allows generating an Adapter to encapsulate this functionality.
- **input-resolutionAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/review/input-resolution.ts) allows generating an Adapter to encapsulate this functionality.
- **dispatcherAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/cli/dispatcher.ts) allows generating an Adapter to encapsulate this functionality.
- **merge-trackAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/cli/merge-track.ts) allows generating an Adapter to encapsulate this functionality.
- **execution-plannerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/track/execution-planner.ts) allows generating an Adapter to encapsulate this functionality.
- **splicerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/context/splicer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-stateAdapter**: Favorable token economics (dependency surface size 11 < 50 for packages/superconductor-core/src/permissions/track-state.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/intelligence/index.ts) allows generating an Adapter to encapsulate this functionality.
- **keyword-inferrerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/permissions/keyword-inferrer.ts) allows generating an Adapter to encapsulate this functionality.
- **model-chooser-dialogAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/models/model-chooser-dialog.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/learning/index.ts) allows generating an Adapter to encapsulate this functionality.
- **workspace-guardAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/src/orchestration/workspace-guard.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/types/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/review/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/protocol/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/telemetry/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/schema/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/utils/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/remediation/index.ts) allows generating an Adapter to encapsulate this functionality.
- **libsql-database-managerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/shared/libsql-database-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/models/index.ts) allows generating an Adapter to encapsulate this functionality.
- **indexAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/swarm/index.ts) allows generating an Adapter to encapsulate this functionality.
- **note-writerAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/notebook/note-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **audit-reporterAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/audit-reporter.ts) allows generating an Adapter to encapsulate this functionality.
- **drift-monitorAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/src/intelligence/drift-monitor.ts) allows generating an Adapter to encapsulate this functionality.
- **resolve-project-rootAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/intelligence/utils/resolve-project-root.ts) allows generating an Adapter to encapsulate this functionality.
- **incremental-updaterAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/intelligence/incremental-updater.ts) allows generating an Adapter to encapsulate this functionality.
- **pipelineAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/intelligence/pipeline.ts) allows generating an Adapter to encapsulate this functionality.
- **cli-blueprintAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/cli-blueprint.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-checkAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/preflight-check.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-blueprint-generatorAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/swarm-blueprint-generator.ts) allows generating an Adapter to encapsulate this functionality.
- **cli-updateAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/intelligence/cli-update.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-analyzerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/intelligence/dependency-analyzer.ts) allows generating an Adapter to encapsulate this functionality.
- **topography-mapAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/topography-map.ts) allows generating an Adapter to encapsulate this functionality.
- **fingerprintAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/runners/fingerprint.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-graphAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/intelligence/runners/dependency-graph.ts) allows generating an Adapter to encapsulate this functionality.
- **complexityAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/runners/complexity.ts) allows generating an Adapter to encapsulate this functionality.
- **sastAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/runners/sast.ts) allows generating an Adapter to encapsulate this functionality.
- **symbol-extractionAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/runners/symbol-extraction.ts) allows generating an Adapter to encapsulate this functionality.
- **test-gapsAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/runners/test-gaps.ts) allows generating an Adapter to encapsulate this functionality.
- **package-surfaceAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/intelligence/runners/package-surface.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-surfaceAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/runners/dependency-surface.ts) allows generating an Adapter to encapsulate this functionality.
- **graphifyAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/runners/graphify.ts) allows generating an Adapter to encapsulate this functionality.
- **tool-registryAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/intelligence/tool-registry.ts) allows generating an Adapter to encapsulate this functionality.
- **preflightAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/preflight.ts) allows generating an Adapter to encapsulate this functionality.
- **reportAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/report.ts) allows generating an Adapter to encapsulate this functionality.
- **prompt-generatorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/prompt-generator.ts) allows generating an Adapter to encapsulate this functionality.
- **pair-programmingAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/pair-programming.ts) allows generating an Adapter to encapsulate this functionality.
- **task-complexity-scorerAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/intelligence/task-complexity-scorer.ts) allows generating an Adapter to encapsulate this functionality.
- **model-tier-routerAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/intelligence/model-tier-router.ts) allows generating an Adapter to encapsulate this functionality.
- **parallelism-optimiserAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/parallelism-optimiser.ts) allows generating an Adapter to encapsulate this functionality.
- **oracle-cadence-optimiserAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/oracle-cadence-optimiser.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-surface-toolAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/dependency-surface-tool.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-partitionerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/domain-partitioner.ts) allows generating an Adapter to encapsulate this functionality.
- **auto-sync-engineAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/src/intelligence/auto-sync-engine.ts) allows generating an Adapter to encapsulate this functionality.
- **language-profileAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/intelligence/utils/language-profile.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-phase-gateAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/review/swarm-phase-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **couplingAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/intelligence/runners/coupling.ts) allows generating an Adapter to encapsulate this functionality.
- **dependency-contextAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/intelligence/dependency-context.ts) allows generating an Adapter to encapsulate this functionality.
- **typesAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/intelligence/runners/types.ts) allows generating an Adapter to encapsulate this functionality.
- **token-budget-estimatorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/telemetry/token-budget-estimator.ts) allows generating an Adapter to encapsulate this functionality.
- **typesAdapter**: Favorable token economics (dependency surface size 17 < 50 for packages/superconductor-core/src/learning/types.ts) allows generating an Adapter to encapsulate this functionality.
- **templatesAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/learning/templates.ts) allows generating an Adapter to encapsulate this functionality.
- **deduplicatorAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/learning/deduplicator.ts) allows generating an Adapter to encapsulate this functionality.
- **harvesterAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/learning/harvester.ts) allows generating an Adapter to encapsulate this functionality.
- **invariant-synthesizerAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/learning/invariant-synthesizer.ts) allows generating an Adapter to encapsulate this functionality.
- **promoterAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/learning/promoter.ts) allows generating an Adapter to encapsulate this functionality.
- **sanitizerAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/learning/sanitizer.ts) allows generating an Adapter to encapsulate this functionality.
- **skill-distillerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/learning/skill-distiller.ts) allows generating an Adapter to encapsulate this functionality.
- **transcript-parserAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/learning/transcript-parser.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-config-writerAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/models/agent-config-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **model-catalog-serviceAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/models/model-catalog-service.ts) allows generating an Adapter to encapsulate this functionality.
- **agent-config-model-resolutionAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/orchestration/agent-config-model-resolution.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-granularityAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/orchestration/swarm-granularity.ts) allows generating an Adapter to encapsulate this functionality.
- **background-task-monitorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/background-task-monitor.ts) allows generating an Adapter to encapsulate this functionality.
- **checkpoint-orchestratorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/checkpoint-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **abstract-gateAdapter**: Favorable token economics (dependency surface size 8 < 50 for packages/superconductor-core/src/orchestration/abstract-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-gateAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/orchestration/preflight-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **quorum-validatorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/orchestration/quorum-validator.ts) allows generating an Adapter to encapsulate this functionality.
- **worktree-isolation-managerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/worktree-isolation-manager.ts) allows generating an Adapter to encapsulate this functionality.
- **model-routing-enforcerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/orchestration/model-routing-enforcer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-lifecycle-wizardAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/track-lifecycle-wizard.ts) allows generating an Adapter to encapsulate this functionality.
- **track-lifecycle-orchestratorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/orchestration/track-lifecycle-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **schemasAdapter**: Favorable token economics (dependency surface size 9 < 50 for packages/superconductor-core/src/permissions/schemas.ts) allows generating an Adapter to encapsulate this functionality.
- **engineAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/permissions/engine.ts) allows generating an Adapter to encapsulate this functionality.
- **toml-providerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/permissions/providers/toml-provider.ts) allows generating an Adapter to encapsulate this functionality.
- **prompterAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/permissions/prompter.ts) allows generating an Adapter to encapsulate this functionality.
- **auditAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/permissions/audit.ts) allows generating an Adapter to encapsulate this functionality.
- **track-readerAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/track/track-reader.ts) allows generating an Adapter to encapsulate this functionality.
- **mcp-schemaAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/protocol/mcp-schema.ts) allows generating an Adapter to encapsulate this functionality.
- **deep-research-escalation-handlerAdapter**: Favorable token economics (dependency surface size 7 < 50 for packages/superconductor-core/src/remediation/deep-research-escalation-handler.ts) allows generating an Adapter to encapsulate this functionality.
- **bias-isolated-review-gateAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/remediation/bias-isolated-review-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-classifierAdapter**: Favorable token economics (dependency surface size 9 < 50 for packages/superconductor-core/src/remediation/domain-classifier.ts) allows generating an Adapter to encapsulate this functionality.
- **domain-split-remediation-dispatcherAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/remediation/domain-split-remediation-dispatcher.ts) allows generating an Adapter to encapsulate this functionality.
- **standalone-remediationAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/remediation/standalone-remediation.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-orchestratorAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/remediation/remediation-orchestrator.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-stateAdapter**: Favorable token economics (dependency surface size 6 < 50 for packages/superconductor-core/src/remediation/remediation-state.ts) allows generating an Adapter to encapsulate this functionality.
- **remediation-log-writerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/remediation/remediation-log-writer.ts) allows generating an Adapter to encapsulate this functionality.
- **quorum-remediation-loopAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/remediation/quorum-remediation-loop.ts) allows generating an Adapter to encapsulate this functionality.
- **extract-fenced-blockAdapter**: Favorable token economics (dependency surface size 5 < 50 for packages/superconductor-core/src/review/extract-fenced-block.ts) allows generating an Adapter to encapsulate this functionality.
- **input-sanitizerAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/utils/input-sanitizer.ts) allows generating an Adapter to encapsulate this functionality.
- **serialize-topographyAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/serialize-topography.ts) allows generating an Adapter to encapsulate this functionality.
- **aggregate-coverageAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/aggregate-coverage.ts) allows generating an Adapter to encapsulate this functionality.
- **cascade-deferral-gateAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/cascade-deferral-gate.ts) allows generating an Adapter to encapsulate this functionality.
- **generate-token-reportAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/generate-token-report.ts) allows generating an Adapter to encapsulate this functionality.
- **abiAdapter**: Favorable token economics (dependency surface size 3 < 50 for packages/superconductor-core/src/review/abi.ts) allows generating an Adapter to encapsulate this functionality.
- **streaming-clientAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/streaming-client.ts) allows generating an Adapter to encapsulate this functionality.
- **playwright-harnessAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/playwright-harness.ts) allows generating an Adapter to encapsulate this functionality.
- **vision-oracleAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/vision-oracle.ts) allows generating an Adapter to encapsulate this functionality.
- **test-theatre-detectorAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/test-theatre-detector.ts) allows generating an Adapter to encapsulate this functionality.
- **preflight-test-runnerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/review/preflight-test-runner.ts) allows generating an Adapter to encapsulate this functionality.
- **LanguagePersonaResolverAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/swarm/LanguagePersonaResolver.ts) allows generating an Adapter to encapsulate this functionality.
- **LanguageAdapterAdapter**: Favorable token economics (dependency surface size 4 < 50 for packages/superconductor-core/src/swarm/LanguageAdapter.ts) allows generating an Adapter to encapsulate this functionality.
- **anti-patternsAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/swarm/anti-patterns.ts) allows generating an Adapter to encapsulate this functionality.
- **RemediatorPromptBuilderAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/swarm/RemediatorPromptBuilder.ts) allows generating an Adapter to encapsulate this functionality.
- **DynamicQuorumContextSplicerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/swarm/DynamicQuorumContextSplicer.ts) allows generating an Adapter to encapsulate this functionality.
- **track-stateAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/track/track-state.ts) allows generating an Adapter to encapsulate this functionality.
- **plan-gap-checkerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/track/plan-gap-checker.ts) allows generating an Adapter to encapsulate this functionality.
- **swarm-authorizerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/track/swarm-authorizer.ts) allows generating an Adapter to encapsulate this functionality.
- **interceptorAdapter**: Favorable token economics (dependency surface size 10 < 50 for packages/superconductor-core/src/permissions/interceptor.ts) allows generating an Adapter to encapsulate this functionality.
- **session-providerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/permissions/providers/session-provider.ts) allows generating an Adapter to encapsulate this functionality.
- **work-unitAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/track/work-unit.ts) allows generating an Adapter to encapsulate this functionality.
- **semantic-cacheAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/cache/semantic-cache.ts) allows generating an Adapter to encapsulate this functionality.
- **quality-notesAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/telemetry/quality-notes.ts) allows generating an Adapter to encapsulate this functionality.
- **codebase-chunkerAdapter**: Favorable token economics (dependency surface size 2 < 50 for packages/superconductor-core/src/intelligence/codebase-chunker.ts) allows generating an Adapter to encapsulate this functionality.
- **audit-swarm-complianceAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/scripts/audit-swarm-compliance.ts) allows generating an Adapter to encapsulate this functionality.
- **migrate-tracksAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/scripts/migrate-tracks.ts) allows generating an Adapter to encapsulate this functionality.
- **in-memory-libsql-clientAdapter**: Favorable token economics (dependency surface size 1 < 50 for packages/superconductor-core/src/test-utils/in-memory-libsql-client.ts) allows generating an Adapter to encapsulate this functionality.

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Verify `swarm-execute` skill is installed... | flash_lite | 38K | ~12 min |
| 2 | Task: Create `PhaseManifest` domain model & Zod... | flash_lite | 56K | ~18 min |
| 3 | Implement AST/block parser identifying `## Phas... | flash_lite | 58K | ~18 min |
| 4 | Run existing track reader unit tests to verify ... | flash_lite | 19K | ~6 min |
| 5 | Task: Implement `PhaseStateStore` with `proper-... | flash_lite | 56K | ~18 min |
| 6 | Task: Build `PhaseTransitionService` with dynam... | flash_lite | 56K | ~18 min |
| 7 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 8 | Task: Implement `phase-cli.ts` entrypoint & int... | flash_lite | 56K | ~18 min |
| 9 | Define command syntax, arguments, and help docu... | flash_lite | 19K | ~6 min |
| 10 | Task: Refactor `skills/batch-execute/SKILL.md` ... | flash_lite | 56K | ~18 min |
| 11 | Update artifact creation to write `"phase_id"` ... | flash_lite | 56K | ~18 min |
| 12 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 13 | Task: End-to-end integration test suite [TIER-3... | flash_lite | 56K | ~18 min |
| 14 | Run `npm --workspace=@superconductor/engine tes... | flash_lite | 56K | ~18 min |
| 15 | UX Reviewer: audit CLI ergonomics, UX-2 banners... | flash_lite | 56K | ~18 min |
| 16 | Run full test suites; No-ff merge to main with ... | flash_lite | 19K | ~6 min |

---

## Phase 0: Swarm Preflight

- [ ] Task: Verify `swarm-execute` skill is installed and loaded [TIER-1:TCS=3] [AGENT:superconductor-processor]
    CREATES: 
    PROTECTED: superconductor/agent-config.md
    INVARIANT_AFTER: "Swarm execution capability MUST be confirmed available before execution begins."
    - [ ] Check `swarm-execute/SKILL.md` exists and is readable [TIER-1:TCS=3]
    - [ ] Confirm agent role mappings in `agent-config.md` [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 1: Domain Models, Schema & AST Parsing

- [ ] Task: Create `PhaseManifest` domain model & Zod schema [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/phase/phase-manifest.ts, packages/superconductor-core/src/phase/phase-manifest.test.ts
    PROTECTED: packages/superconductor-core/src/schema/track-manifest.ts
    INVARIANT_AFTER: "Phase IDs MUST match /^[a-z0-9_-]{1,64}$/ and prohibit directory traversal sequences."
    - [ ] Write tests for `PhaseManifest` Zod schema validation (valid IDs, invalid characters, traversal strings) [TIER-1:TCS=3]
    - [ ] Implement `PhaseManifest`, `PhaseStatus` ('planned' | 'active' | 'blocked' | 'completed'), and `PhaseTrackItem` types [TIER-1:TCS=3]
    - [ ] Add serialization and deserialization helpers [TIER-1:TCS=3]

- [ ] Task: Implement `PhaseRegistryParser` multi-section AST parser [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/phase/phase-registry-parser.ts, packages/superconductor-core/src/phase/phase-registry-parser.test.ts
    PROTECTED: superconductor/tracks.md
    INVARIANT_AFTER: "Parser MUST extract all phase sections and tables without truncating subsequent sections."
    - [ ] Write unit tests for multi-phase markdown parsing, table extraction, and legacy unphased fallback [TIER-1:TCS=3]
    - [ ] Implement AST/block parser identifying `## Phase <N>: <Name> (<Status>)` headings and individual markdown tables [TIER-1:TCS=3]
    - [ ] Implement serializer formatting AST back to compliant Markdown with consistent table alignment [TIER-1:TCS=3]
    - [ ] Verify existing `superconductor/tracks.md` parses cleanly into default virtual phase without data loss [TIER-1:TCS=3]

- [ ] Task: Update `track-reader.ts` and `migrate-tracks.ts` to consume `PhaseRegistryParser` [TIER-2:TCS=4] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/track/track-reader.ts, packages/superconductor-core/scripts/migrate-tracks.ts
    PROTECTED: packages/superconductor-core/src/track/archive-manager.ts
    INVARIANT_AFTER: "Legacy track reader methods MUST return all active tracks across all phase sections."
    - [ ] Update `readTrackRegistry` in `track-reader.ts` to delegate to `PhaseRegistryParser` [TIER-1:TCS=4]
    - [ ] Fix table truncation loop in `migrate-tracks.ts` line 115 [TIER-1:TCS=4]
    - [ ] Run existing track reader unit tests to verify backward compatibility [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 1: Domain Models & AST Parsing' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 2: State Persistence & Concurrency (`PhaseStateStore`)

- [ ] Task: Implement `PhaseStateStore` with `proper-lockfile` concurrency guard [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/phase/phase-state-store.ts, packages/superconductor-core/src/phase/phase-state-store.test.ts
    PROTECTED: superconductor/tracks.md
    INVARIANT_AFTER: "Mutations to tracks.md MUST acquire proper-lockfile and use atomic write-rename."
    - [ ] Write unit tests simulating concurrent reads and writes with lock contention [TIER-1:TCS=3]
    - [ ] Implement `PhaseStateStore.load(projectRoot)` and `PhaseStateStore.save(projectRoot, manifest)` [TIER-1:TCS=3]
    - [ ] Wrap disk writes in `.tmp` atomic replace pattern with lock retry and exponential backoff [TIER-1:TCS=3]
    - [ ] Add rollback capability on parse or disk write failures [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 2: State Persistence & Concurrency' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 3: Sliding-Window State Machine & Transitions (`PhaseTransitionService`)

- [ ] Task: Build `PhaseTransitionService` with dynamic sliding-window renumbering [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/phase/phase-transition-service.ts, packages/superconductor-core/src/phase/phase-transition-service.test.ts
    PROTECTED: packages/superconductor-core/src/phase/phase-manifest.ts
    INVARIANT_AFTER: "When Phase 1 reaches 100% completion, Phase 2 MUST become the new active Phase 1."
    - [ ] Write unit tests for phase completion checks, sliding-window progression, and dynamic ordinal assignment [TIER-1:TCS=3]
    - [ ] Implement `evaluatePhaseCompletion(phase)` checking all tracks are `[x]` [TIER-1:TCS=3]
    - [ ] Implement `advanceWindow(manifest)` marking completed phase `(Complete)` and shifting upcoming phase to `(Active)` [TIER-1:TCS=3]
    - [ ] Implement dynamic display ordinal computation (Phase 1 = active phase, Phase 2+ = pending phases) [TIER-1:TCS=3]
    - [ ] Add cross-phase dependency validator preventing circular or forward dependencies [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 3: Sliding-Window State Machine' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 4: Phase Management CLI (`/superconductor:phase`)

- [ ] Task: Implement `phase-cli.ts` entrypoint & interactive switcher [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/cli/phase-cli.ts, packages/superconductor-core/src/cli/phase-cli.test.ts
    PROTECTED: packages/superconductor-core/src/index.ts
    INVARIANT_AFTER: "CLI output MUST follow UX-2 single-line glancable formatting and standard status glyphs."
    - [ ] Write CLI unit tests for `list`, `status`, `switch`, and `advance` commands [TIER-1:TCS=3]
    - [ ] Implement interactive select prompt allowing user to choose active target phase [TIER-1:TCS=3]
    - [ ] Implement glancable status view reporting completion percentage and tracks per phase [TIER-1:TCS=3]
    - [ ] Export phase utilities from `packages/superconductor-core/src/index.ts` [TIER-1:TCS=3]

- [ ] Task: Create command specification `commands/superconductor/phase.toml` [TIER-1:TCS=3] [AGENT:superconductor-processor]
    CREATES: commands/superconductor/phase.toml
    PROTECTED: commands/superconductor/status.toml
    INVARIANT_AFTER: "Command definition MUST expose description, subcommands, and flags."
    - [ ] Define command syntax, arguments, and help documentation [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 4: Phase Management CLI' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 5: Phase-Aware Batch Execution & Skill Integration

- [ ] Task: Refactor `skills/batch-execute/SKILL.md` for phase-targeted execution [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: skills/batch-execute/SKILL.md
    PROTECTED: skills/batch-execute/SKILL.md
    INVARIANT_AFTER: "batch-execute MUST target active Phase 1 by default, support --phase, and continue on morning presents without looping."
    - [ ] Update Section 1.1 Queue Resolution to filter pending tracks strictly within the targeted phase [TIER-1:TCS=3]
    - [ ] Update Section 2.4 to implement interactive continue-on-failure policy (`--phase-policy=continue`) [TIER-1:TCS=3]
    - [ ] Ensure line count remains strictly <= 500 lines [TIER-1:TCS=3]

- [ ] Task: Update `skills/new-track/SKILL.md` to support phase assignment [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: skills/new-track/SKILL.md
    PROTECTED: skills/new-track/SKILL.md
    INVARIANT_AFTER: "new-track MUST record phase_id in metadata.json and place track in target phase table."
    - [ ] Add phase selection / default to active Phase 1 in track initialization [TIER-1:TCS=3]
    - [ ] Update artifact creation to write `"phase_id"` into `metadata.json` [TIER-1:TCS=3]
    - [ ] Insert new track row into the appropriate phase section in `tracks.md` [TIER-1:TCS=3]
    - [ ] Verify line count remains strictly <= 500 lines [TIER-1:TCS=3]

- [ ] Task: Update `skills/status/SKILL.md` to display phase grouping [TIER-1:TCS=3] [AGENT:superconductor-processor]
    CREATES: skills/status/SKILL.md
    PROTECTED: skills/status/SKILL.md
    INVARIANT_AFTER: "Status output MUST group tracks by active and pending phases."
    - [ ] Add phase breakdown section to status output [TIER-1:TCS=3]
    - [ ] Verify line count remains strictly <= 500 lines [TIER-1:TCS=3]

- [ ] Task: Superconductor - User Manual Verification 'Phase 5: Phase-Aware Batch Execution & Skills' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 6: End-to-End Integration & Quorum Sign-off

- [ ] Task: End-to-end integration test suite [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/__tests__/integration/phase-system-flow.test.ts
    PROTECTED: packages/superconductor-core/src/__tests__/integration/setup-intelligence-flow.test.ts
    INVARIANT_AFTER: "Integration suite MUST verify full phase lifecycle: parsing, batching, sliding-window advance, and morning present recovery."
    - [ ] Test multi-phase initialization, switching, and track addition [TIER-1:TCS=3]
    - [ ] Test batch execution queue resolution with phase boundaries [TIER-1:TCS=3]
    - [ ] Test sliding-window renumbering when Phase 1 finishes (Phase 2 -> Phase 1) [TIER-1:TCS=3]
    - [ ] Test failure recovery and continue-on-failure policy across phases [TIER-1:TCS=3]

- [ ] Task: 500-line ceiling verification for all modified skill files [TIER-1:TCS=3] [AGENT:superconductor-processor]
    CREATES: 
    PROTECTED: packages/engine/tests/skill-line-count.test.ts
    INVARIANT_AFTER: "All SKILL.md files MUST be <= 500 lines."
    - [ ] Run `npm --workspace=@superconductor/engine test` to assert 0 line count violations [TIER-1:TCS=3]

- [ ] Task: Run 5-Seat Quorum Review (Correctness, Adversarial, Security, Regression, UX) [TIER-3:TCS=3] [AGENT:superconductor-reviewer]
    CREATES: 
    PROTECTED: superconductor/quorum/
    INVARIANT_AFTER: "All 5 reviewers MUST return status: RESOLVED with 0 blocking findings."
    - [ ] Correctness Reviewer: verify all 11 ACs [TIER-1:TCS=3]
    - [ ] Adversarial Reviewer: audit sliding window, concurrency, and race conditions [TIER-1:TCS=3]
    - [ ] Security Reviewer: audit path traversal on phase_id and proper-lockfile guards [TIER-1:TCS=3]
    - [ ] Regression Reviewer: audit legacy track compatibility and monorepo suites [TIER-1:TCS=3]
    - [ ] UX Reviewer: audit CLI ergonomics, UX-2 banners, and 56-rule engine compliance [TIER-1:TCS=3]

- [ ] Task: Superconductor Oracle Final Sign-off Gate [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    CREATES: superconductor/quorum/signoff_track_phases_and_sliding_window_20260921.json
    PROTECTED: superconductor/tracks.md
    INVARIANT_AFTER: "Oracle signoff token MUST be cryptographically generated and committed."
    - [ ] Verify 5-reviewer unanimous resolution [TIER-1:TCS=3]
    - [ ] Issue autonomous HMAC sign-off token [TIER-1:TCS=3]

- [ ] Task: Integrate track 'track_phases_and_sliding_window_20260921' into main branch [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [ ] Verify clean working copy (`git status --porcelain`) [TIER-1:TCS=3]
    - [ ] Run full test suites [TIER-1:TCS=3]
    - [ ] No-ff merge to main with Swarm Authorizer trailer [TIER-1:TCS=3]
