# Implementation Plan: `intelligence_setup_fix_20260920`

> **Track:** Intelligence & Setup Subsystem Fix  
> **Target Branch:** `main`  
> **Oracle:** Proactive Planning AUTHORIZED — 5 DRY modules approved

---

## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 34 tasks)
**Estimated Track Token Budget:** ~1.3M tokens · ~$0.10 at blended rates

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
| 1 | Task: Verify `swarm-execute` skill is installed... | flash_lite | 47K | ~15 min |
| 2 | Task: Create `resolveProjectRoot()` utility [TI... | flash_lite | 56K | ~18 min |
| 3 | Write failing tests: TypeScript profile, Python... | flash_lite | 56K | ~18 min |
| 4 | Implement, consuming `IntelligenceSnapshotReade... | flash_lite | 58K | ~18 min |
| 5 | Output format MUST conform to UX-2 standard: [T... | flash_lite | 28K | ~9 min |
| 6 | Task: Fix `cli-update.ts` — empty args full sca... | flash, flash_lite | 60K | ~18 min |
| 7 | Task: Fix `package-surface.ts` — non-monorepo c... | flash, flash_lite | 61K | ~18 min |
| 8 | Replace `env: { PATH: ... }` with `env: { ...pr... | flash_lite | 58K | ~18 min |
| 9 | Replace hardcoded `--languages=TypeScript,JavaS... | flash_lite | 56K | ~18 min |
| 10 | Wire `IntelligencePreflightCheck.run()` as pref... | flash_lite | 28K | ~9 min |
| 11 | Task: Fix `PROJECT_ROOT` dynamic resolution in ... | flash, flash_lite | 60K | ~18 min |
| 12 | Remove restrictive `startsWith` check; replace ... | flash_lite | 56K | ~18 min |
| 13 | Accept `workspaceRoot` parameter in graph query... | flash_lite | 56K | ~18 min |
| 14 | Add env pass-through for `PROJECT_ROOT` and `SU... | flash_lite | 19K | ~6 min |
| 15 | Task: Fix `getSuperconductorHome()` in three sk... | flash_lite | 56K | ~18 min |
| 16 | Audit all occurrences: setup/SKILL.md:358,395,4... | flash_lite | 56K | ~18 min |
| 17 | Update success banner format [TIER-1:TCS=3]; Ad... | flash_lite | 56K | ~18 min |
| 18 | Task: Update `new-track/SKILL.md §2.3a` to refe... | flash_lite | 38K | ~12 min |
| 19 | Task: Create `UxRuleEngine` — programmatic 56-r... | flash_lite | 56K | ~18 min |
| 20 | QUORUM mode section: role declaration, input sc... | flash_lite | 56K | ~18 min |
| 21 | `references/checklist.md`: full 56-item checkli... | flash_lite | 56K | ~18 min |
| 22 | Add processor pre-load detection block to both ... | flash_lite | 28K | ~9 min |
| 23 | Task: End-to-end integration test — setup → int... | flash_lite | 56K | ~18 min |
| 24 | All findings resolved to zero [TIER-1:TCS=3]; T... | flash_lite | 56K | ~18 min |
| 25 | Run full test suite; confirm >80% coverage [TIE... | flash_lite | 47K | ~15 min |


---

## Phase 0: Swarm Preflight

- [x] Task: Verify `swarm-execute` skill is installed and loaded [TIER-1:TCS=3] [AGENT:superconductor-processor]
    INVARIANT_AFTER: "Swarm orchestration is available for automated execution of this track."
    - [x] Check `~/.gemini/config/plugins/superconductor/skills/swarm-execute/SKILL.md` exists [TIER-1:TCS=3]
    - [x] Verify `superconductor-kernel` MCP server is running and responsive [TIER-1:TCS=3]
    - [x] Confirm `kernel_intelligence_status` tool is reachable (even if returning NONE) [TIER-1:TCS=3]
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 1: Core Foundation — Shared Infrastructure

- [x] Task: Create `resolveProjectRoot()` utility [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/utils/resolve-project-root.ts, packages/superconductor-core/src/intelligence/utils/resolve-project-root.test.ts
    INVARIANT_AFTER: "resolveProjectRoot() returns the git root via `git rev-parse --show-toplevel` with a safe `process.cwd()` fallback. Returns absolute, realpathSync-normalized path."
    - [x] Write failing tests: CWD-within-repo, CWD-at-root, non-git-directory fallback, symlink resolution [TIER-1:TCS=3]
    - [x] Implement `resolveProjectRoot(fromDir?: string): string` using `execFileSync('git', ['rev-parse', '--show-toplevel'])` with try/catch [TIER-1:TCS=3]
    - [x] Export from `packages/superconductor-core/src/intelligence/index.ts` [TIER-1:TCS=3]
    - [x] Verify >80% coverage [TIER-1:TCS=3]

- [x] Task: Create `LanguageProfile` utility [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/utils/language-profile.ts, packages/superconductor-core/src/intelligence/utils/language-profile.test.ts
    INVARIANT_AFTER: "LanguageProfile.fromFingerprint(outputDir) reads 01_fingerprint.json.primaryLanguage and returns { ctagsLanguages, fileExtensions, testFilePattern, sourceGlobs } for all supported languages."
    - [x] Write failing tests: TypeScript profile, Python profile, Go profile, Rust profile, fallback/unknown [TIER-1:TCS=3]
    - [x] Implement `LanguageProfile` class with static `fromFingerprint(outputDir: string)` factory [TIER-1:TCS=3]
    - [x] Supported language map: TypeScript, JavaScript, Python, Go, Rust, C, C++, Java [TIER-1:TCS=3]
    - [x] Export from intelligence index [TIER-1:TCS=3]

- [x] Task: Create `IntelligenceAuditReporter` utility [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/audit-reporter.ts, packages/superconductor-core/src/intelligence/audit-reporter.test.ts
    INVARIANT_AFTER: "IntelligenceAuditReporter.report(outputDir, projectRoot) returns { status: 'LIVE'|'STALE'|'NONE'|'MISMATCH', project_root, manifest_project_root, snapshot_path, head_commit, age_days, commits_behind, phases_ok }. Status is 'MISMATCH' when manifest.projectRoot !== projectRoot."
    - [x] Write failing tests: LIVE state, STALE state, NONE state (missing manifest), MISMATCH state [TIER-1:TCS=3]
    - [x] Implement, consuming `IntelligenceSnapshotReader.load()` and `DriftMonitor` [TIER-1:TCS=3]
    - [x] Fix 0-commit greenfield bug in `drift-monitor.ts`: `headSha === 'unknown'` → `commitsBehind = 0, status = LIVE` [TIER-1:TCS=5]
    - [x] Export from intelligence index [TIER-1:TCS=3]

- [x] Task: Create `IntelligencePreflightCheck` utility [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/preflight-check.ts, packages/superconductor-core/src/intelligence/preflight-check.test.ts
    PROTECTED: packages/superconductor-core/src/intelligence/snapshot-reader.ts
    INVARIANT_AFTER: "IntelligencePreflightCheck.run(projectRoot) emits a structured status line conforming to UX-2 standard, returns AuditReport, and on MISMATCH triggers auto re-scan offer."
    - [x] Write failing tests: LIVE emits positive banner, MISMATCH emits warning with both dirs, NONE emits actionable guidance [TIER-1:TCS=3]
    - [x] Implement, using `resolveProjectRoot()` + `IntelligenceAuditReporter` [TIER-1:TCS=3]
    - [x] Output format MUST conform to UX-2 standard: [TIER-1:TCS=3]
      ```
      [superconductor] Intelligence: LIVE | Project: <name> | SHA: <sha7> | Age: <Xh>
      [superconductor] Intelligence: MISMATCH | Indexed: <other_dir> | Current: <dir>
      [superconductor] Intelligence: NONE | Run: /superconductor:setup to index this project
      ```
    - [x] Export and wire to `cli-blueprint.ts` (Phase 2) [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 1: Core Foundation' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 2: Core Intelligence Refactors

- [x] Task: Fix `cli-update.ts` — empty args full scan + projectRoot fix [TIER-3:TCS=7] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/cli-update.ts (modified)
    PROTECTED: packages/superconductor-core/src/intelligence/pipeline.ts
    INVARIANT_AFTER: "Running cli-update.js with no arguments triggers runPipeline([], projectRoot, outputDir) where projectRoot is from resolveProjectRoot() and outputDir is path.join(projectRoot, 'superconductor', 'intelligence'). Emits '[superconductor:intelligence] Indexing Project: <root>' as first log line."
    - [x] Write tests: empty args → full scan, --full flag, --changed-files flag, projectRoot resolution from git root not cwd [TIER-1:TCS=3]
    - [x] Fix `changedFiles.length === 0` → call `runPipeline([], projectRoot, outputDir)` instead of `process.exit(0)` [TIER-1:TCS=3]
    - [x] Use `resolveProjectRoot()` for both `projectRoot` and `outputDir` [TIER-1:TCS=3]
    - [x] Add `--full` explicit flag; emit structured preflight log lines [TIER-1:TCS=3]
    - [x] Add diagnostic output: `[superconductor:intelligence] Indexing Project: <projectRoot>` + `Output Directory: <outputDir>` [TIER-1:TCS=3]

- [x] Task: Fix `package-surface.ts` — non-monorepo crash + standard dirs [TIER-3:TCS=7] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/runners/package-surface.ts (modified)
    INVARIANT_AFTER: "package-surface.ts never throws ENOENT for missing packages/ directory. Scans src/, app/, lib/, cmd/ when packages/ is absent."
    - [x] Write tests: monorepo with packages/, Next.js with src/app/, Go project with cmd/, empty project [TIER-1:TCS=3]
    - [x] Wrap `fs.readdirSync('packages')` with `fs.existsSync()` guard [TIER-1:TCS=3]
    - [x] Add fallback scan: `src`, `app`, `lib`, `cmd` [TIER-1:TCS=3]

- [x] Task: Fix `graphify.ts` environment erasure [TIER-2:TCS=5] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/runners/graphify.ts (modified)
    INVARIANT_AFTER: "graphify.ts passes `{ ...process.env, PATH: resolvedPath }` to execFileSync, never stripping HOME, USER, or user-installed tool paths."
    - [x] Write test: verify spawned env includes HOME and USER [TIER-1:TCS=3]
    - [x] Replace `env: { PATH: ... }` with `env: { ...process.env, PATH: ... }` [TIER-1:TCS=3]

- [x] Task: Fix `fingerprint.ts` unquoted shell execution [TIER-2:TCS=5] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-core/src/intelligence/runners/fingerprint.ts (modified)
    INVARIANT_AFTER: "fingerprint.ts uses spawnSync('tokei', [projectRoot, '--output', 'json']) not execSync with string interpolation."
    - [x] Write test: projectRoot with spaces succeeds [TIER-1:TCS=3]
    - [x] Replace `execSync(\`tokei ${projectRoot}...\`)` with `spawnSync` [TIER-1:TCS=3]

- [x] Task: Update multi-language runners using `LanguageProfile` [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - packages/superconductor-core/src/intelligence/runners/symbol-extraction.ts (modified)
      - packages/superconductor-core/src/intelligence/runners/dependency-graph.ts (modified)
      - packages/superconductor-core/src/intelligence/runners/test-gaps.ts (modified)
    PROTECTED: packages/superconductor-core/src/intelligence/runners/fingerprint.ts
    INVARIANT_AFTER: "symbol-extraction uses LanguageProfile.ctagsLanguages. dependency-graph uses LanguageProfile.sourceGlobs. test-gaps uses LanguageProfile.fileExtensions. All three produce non-empty output for TypeScript, Python, Go, and Rust projects."
    - [x] Write tests: Go project produces non-empty symbols; Python project produces non-empty dependency graph; Rust project produces non-empty test gap analysis [TIER-1:TCS=3]
    - [x] Replace hardcoded `--languages=TypeScript,JavaScript` with `LanguageProfile.ctagsLanguages` [TIER-1:TCS=3]
    - [x] Replace hardcoded `packages/superconductor-core/src` source path with `LanguageProfile.sourceGlobs` [TIER-1:TCS=3]
    - [x] Replace hardcoded `.ts`/`.js` extension filter with `LanguageProfile.fileExtensions` [TIER-1:TCS=3]

- [x] Task: Create `cli-blueprint.ts` CLI wrapper [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - packages/superconductor-core/src/intelligence/cli-blueprint.ts
      - packages/superconductor-core/src/intelligence/cli-blueprint.test.ts
    PROTECTED: packages/superconductor-core/src/orchestration/swarm-blueprint-generator.ts
    INVARIANT_AFTER: "cli-blueprint.js accepts a plan.md path argument, calls SwarmBlueprintGenerator.generate() and SwarmBlueprintGenerator.annotatePlan(), outputs a JSON cost summary to stdout, and writes the annotated plan in place."
    - [x] Write tests: valid plan.md → JSON cost summary output; annotated plan has ## Swarm Blueprint section [TIER-1:TCS=3]
    - [x] Implement CLI wrapper around `SwarmBlueprintGenerator` [TIER-1:TCS=3]
    - [x] Wire `IntelligencePreflightCheck.run()` as preflight step [TIER-1:TCS=3]
    - [x] Build and verify `dist/intelligence/cli-blueprint.js` exists after `npm run build` [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 2: Core Intelligence Refactors' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 3: MCP Server Fixes (`superconductor-kernel`)

- [x] Task: Fix `PROJECT_ROOT` dynamic resolution in `index.ts` [TIER-3:TCS=8] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-kernel/src/index.ts (modified)
    PROTECTED: packages/superconductor-kernel/src/services/GraphCache.ts
    INVARIANT_AFTER: "PROJECT_ROOT fallback is process.cwd() not path.resolve(PACKAGE_ROOT, '../..'). TaskProvider and NotebookService receive workspace-relative paths, not extension-relative paths."
    - [x] Write tests: MCP server started from user project dir resolves PROJECT_ROOT to user project dir [TIER-1:TCS=3]
    - [x] Replace `path.resolve(PACKAGE_ROOT, '../..')` fallback with `process.cwd()` [TIER-1:TCS=3]
    - [x] Update `createTaskProvider(PROJECT_ROOT)` and `notebookService` to use dynamic resolution [TIER-1:TCS=3]

- [x] Task: Refactor `IntelligenceStatusService` to use `IntelligenceAuditReporter` [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: packages/superconductor-kernel/src/services/IntelligenceStatusService.ts (modified)
    PROTECTED: packages/superconductor-core/src/intelligence/audit-reporter.ts
    INVARIANT_AFTER: "IntelligenceStatusService.getStatus() delegates to IntelligenceAuditReporter.report(). The startsWith(PROJECT_ROOT) containment check is removed. External workspace paths are accepted. MISMATCH status is returned — not an error thrown."
    - [x] Write tests: external workspace path no longer throws; MISMATCH returned when manifest.projectRoot differs [TIER-1:TCS=3]
    - [x] Remove restrictive `startsWith` check; replace with `fs.realpathSync` comparison [TIER-1:TCS=3]
    - [x] Delegate drift/manifest logic to `IntelligenceAuditReporter` [TIER-1:TCS=3]
    - [x] Fix `refresh()` to resolve CLI binary from `PACKAGE_ROOT` (extension path), not `PROJECT_ROOT` [TIER-1:TCS=3]

- [x] Task: Fix `GraphCache` static path lock + `kernel_intelligence_get_hotspots` error handling [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - packages/superconductor-kernel/src/services/GraphCache.ts (modified)
      - packages/superconductor-kernel/src/index.ts (modified, hotspots handler)
    INVARIANT_AFTER: "GraphCache.load() returns empty result instead of throwing when graph file is missing. kernel_intelligence_get_hotspots returns { hotspots: [], status: 'NONE' } on missing file."
    - [x] Write tests: missing graph file → empty result not throw; hotspots tool returns NONE gracefully [TIER-1:TCS=3]
    - [x] Add `try/catch` around `graphCache.load()`; return `{ hotspots: [], status: 'NONE' }` [TIER-1:TCS=3]
    - [x] Accept `workspaceRoot` parameter in graph query tools for dynamic path resolution [TIER-1:TCS=3]

- [x] Task: Update `kernel_intelligence_status` MCP schema + response contract [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - ~/.gemini/antigravity-cli/mcp/superconductor_superconductor-kernel/kernel_intelligence_status.json (modified)
      - packages/superconductor-kernel/src/index.ts (modified, status handler)
    INVARIANT_AFTER: "kernel_intelligence_status schema includes workspaceRoot parameter. Response includes { status, project_root, manifest_project_root, snapshot_path, head_commit, age_days, commits_behind }."
    - [x] Update MCP JSON schema to expose `workspaceRoot` input and all response fields [TIER-1:TCS=3]
    - [x] Update handler to return full audit payload from `IntelligenceAuditReporter` [TIER-1:TCS=3]

- [x] Task: Inject `PROJECT_ROOT` in `mcp_config.json` [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: mcp_config.json (modified)
    INVARIANT_AFTER: "mcp_config.json passes PROJECT_ROOT from AGY workspace environment to superconductor-kernel. Server starts with correct workspace context."
    - [x] Research AGY workspace environment variable injection mechanism [TIER-1:TCS=3]
    - [x] Add env pass-through for `PROJECT_ROOT` and `SUPERCONDUCTOR_DIR` to MCP server config [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 3: MCP Server Fixes' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 4: Skill File Fixes

- [x] Task: Fix `getSuperconductorHome()` in three skills + add mismatch detection [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - skills/new-track/SKILL.md (modified)
      - skills/coding-agent/SKILL.md (modified)
      - skills/standalone-review/SKILL.md (modified)
    INVARIANT_AFTER: "All three skills resolve outputDir as path.join(PROJECT_ROOT, 'superconductor', 'intelligence'). All three include IntelligencePreflightCheck protocol with UX-2 compliant status output. getSuperconductorHome() is NOT used for snapshot resolution in any skill."
    - [x] Replace `getSuperconductorHome()` references at new-track/SKILL.md:193, coding-agent/SKILL.md:17, standalone-review/SKILL.md:223 [TIER-1:TCS=3]
    - [x] Add preflight check block using `node ${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/cli/index.js intelligence --preflight` [TIER-1:TCS=3]
    - [x] Add mismatch detection text and auto re-scan trigger [TIER-1:TCS=3]
    - [x] Add null guard before `context.driftBanner` access (HIGH-1 fix) [TIER-1:TCS=3]

- [x] Task: Fix all hardcoded `~/.gemini/extensions/superconductor` paths in skills [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - skills/setup/SKILL.md (modified)
      - skills/setup/references/setup-protocol.md (modified)
      - skills/new-track/SKILL.md (modified)
    INVARIANT_AFTER: "No file in skills/ references ~/.gemini/extensions/superconductor. All plugin-path references use dynamic SUPERCONDUCTOR_DIR derived from SKILL.md's own directory at runtime."
    - [x] Audit all occurrences: setup/SKILL.md:358,395,400,445; new-track/SKILL.md:271; setup-protocol.md:4 [TIER-1:TCS=3]
    - [x] Replace with SUPERCONDUCTOR_DIR dynamic resolution pattern [TIER-1:TCS=3]

- [x] Task: Fix `setup/SKILL.md` — baseline scan, false banner, audit table, intelligence repair mode [TIER-3:TCS=3] [AGENT:superconductor-processor]
    CREATES: skills/setup/SKILL.md (modified)
    INVARIANT_AFTER: "setup/SKILL.md §2.7 calls kernel_intelligence_refresh { force: true } then verifies status === LIVE before emitting success banner. Banner reads: '✅ Intelligence baseline established for <projectRoot> (SHA: <sha>)'. Intelligence state is included in §1.2 audit table. Targeted intelligence-only re-run is possible without HALT on initialized projects."
    - [x] Remove `superconductor_run_intelligence` MCP tool reference [TIER-1:TCS=3]
    - [x] Replace relative `node packages/...` with absolute `node ${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/cli/index.js intelligence` [TIER-1:TCS=3]
    - [x] Gate success banner on `kernel_intelligence_status.status === 'LIVE'` confirmation [TIER-1:TCS=3]
    - [x] Update success banner format [TIER-1:TCS=3]
    - [x] Add `superconductor/intelligence/00_manifest.json` to §1.2 audit table [TIER-1:TCS=3]
    - [x] Add intelligence repair mode (skip HALT if project initialized but intelligence missing) [TIER-1:TCS=3]

- [x] Task: Fix git hook missing `verify-signoff.mjs` [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES: scripts/hooks/commit-msg (modified)
    INVARIANT_AFTER: "commit-msg hook resolves verify-signoff.mjs from ${SUPERCONDUCTOR_DIR}/scripts/hooks/verify-signoff.mjs. Committing on a track/* branch never fails with 'Cannot find module'."
    - [x] Write test: simulate commit from project with hook; verify it resolves correctly [TIER-1:TCS=3]
    - [x] Update line 29 in `scripts/hooks/commit-msg` [TIER-1:TCS=3]

- [x] Task: Update `new-track/SKILL.md §2.3a` to reference compiled `cli-blueprint.js` [TIER-1:TCS=3] [AGENT:superconductor-processor]
    CREATES: skills/new-track/SKILL.md (modified)
    INVARIANT_AFTER: "new-track/SKILL.md §2.3a references `node ${SUPERCONDUCTOR_DIR}/packages/superconductor-core/dist/intelligence/cli-blueprint.js` with correct absolute path."
    - [x] Update line 241 reference [TIER-1:TCS=3]
    - [x] Verify the compiled file exists at the referenced path [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 4: Skill File Fixes' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 5: UX/Consistency Reviewer Skill

- [x] Task: Create `UxRuleEngine` — programmatic 56-rule evaluation engine [TIER-4:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - packages/superconductor-core/src/review/ux-rule-engine.ts
      - packages/superconductor-core/src/review/ux-rule-engine.test.ts
      - packages/superconductor-core/src/review/rules/
    INVARIANT_AFTER: "UxRuleEngine.evaluate(input: UxReviewInput) returns { verdict: 'PASS'|'NEEDS_FIXES', findings: Finding[], coverage_manifest: string[] }. All 56 rules from the research brief checklist are implemented across 8 rule groups."
    - [x] Write tests: banner without verified success → NEEDS_FIXES; error without remediation → NEEDS_FIXES; passive voice → NEEDS_FIXES; PASS on compliant output [TIER-1:TCS=3]
    - [x] Implement 8 rule groups: Output Message Quality, Terminology Consistency, Instruction Clarity, Visual Hierarchy, Cognitive Load, Schema Ergonomics, Emoji Usage, Do-More-With-Less [TIER-1:TCS=3]
    - [x] Each rule: unique ID (UX-OUT-01, UX-TRM-01, etc.), severity, evaluative predicate, generative heuristic [TIER-1:TCS=3]
    - [x] CLI entrypoint: `node dist/review/ux-rule-engine-cli.js --input <file|stdin> [--mode quorum|processor]` [TIER-1:TCS=3]

- [x] Task: Write `skills/ux-reviewer/SKILL.md` — dual-mode orchestration skill [TIER-3:TCS=3] [AGENT:superconductor-dreamer]
    CREATES:
      - skills/ux-reviewer/SKILL.md
      - skills/ux-reviewer/references/checklist.md
      - skills/ux-reviewer/references/processor-heuristics.md
    INVARIANT_AFTER: "skills/ux-reviewer/SKILL.md defines two distinct invocation modes. In QUORUM mode: ingests diff/output, runs UxRuleEngine, emits structured PASS/NEEDS_FIXES verdict with finding IDs and severity. In PROCESSOR mode: pre-loads active heuristics as numbered imperatives the agent consults while building. Skill passes its own UX-1 through UX-12 checks."
    - [x] QUORUM mode section: role declaration, input schema, evaluation protocol, output format [TIER-1:TCS=3]
    - [x] PROCESSOR mode section: 20 active heuristics as numbered imperatives (from research brief Section 10) [TIER-1:TCS=3]
    - [x] Terminology lexicon: canonical terms, prohibited synonyms table [TIER-1:TCS=3]
    - [x] Error anatomy template (7-element structure from research brief Section 2) [TIER-1:TCS=3]
    - [x] UX-2 status line format standard [TIER-1:TCS=3]
    - [x] Emoji semantic mapping table [TIER-1:TCS=3]
    - [x] `references/checklist.md`: full 56-item checklist with IDs, severity, criteria [TIER-1:TCS=3]
    - [x] `references/processor-heuristics.md`: 20 active generative imperatives [TIER-1:TCS=3]

- [x] Task: Register `ux-reviewer` in quorum panel configuration [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - skills/swarm-execute/SKILL.md (modified — add ux-reviewer to quorum panel)
      - skills/swarm-orchestrate/SKILL.md (modified)
    PROTECTED: skills/correctness-reviewer/SKILL.md, skills/adversarial-reviewer/SKILL.md, skills/security-reviewer/SKILL.md
    INVARIANT_AFTER: "The 5-reviewer quorum panel includes: correctness + adversarial + security + regression + ux-reviewer. swarm-execute/SKILL.md documents the UX reviewer role and its PASS/NEEDS_FIXES verdict semantics."
    - [x] Add `ux-reviewer` to quorum panel in `swarm-execute/SKILL.md` [TIER-1:TCS=3]
    - [x] Update quorum unanimity rule to require all 5 reviewers RESOLVED [TIER-1:TCS=3]

- [x] Task: Add `ux-reviewer` pre-load to `implement/SKILL.md` and `coding-agent/SKILL.md` [TIER-2:TCS=3] [AGENT:superconductor-processor]
    CREATES:
      - skills/implement/SKILL.md (modified)
      - skills/coding-agent/SKILL.md (modified)
    PROTECTED: skills/ux-reviewer/SKILL.md
    INVARIANT_AFTER: "When implement or coding-agent is building UI/CLI/prompt-facing features, ux-reviewer/SKILL.md is pre-loaded in PROCESSOR mode. Detection signal: task involves output messages, banners, skill files, MCP schemas, or CLI flags."
    - [x] Add processor pre-load detection block to both skills [TIER-1:TCS=3]
    - [x] Pre-load triggers: keywords `banner`, `error message`, `CLI`, `MCP tool`, `SKILL.md`, `prompt`, `agent instruction` [TIER-1:TCS=3]

- [x] Task: Superconductor - User Manual Verification 'Phase 5: UX Reviewer Skill' (Protocol in workflow.md) [TIER-1:TCS=3]

---

## Phase 6: Integration & Finalization

- [x] Task: End-to-end integration test — setup → intelligence → new-track [TIER-3:TCS=3] [AGENT:superconductor-processor]
    INVARIANT_AFTER: "Full flow: /superconductor:setup on a fresh Go project → kernel_intelligence_status returns LIVE with correct project_root → /superconductor:new-track emits positive driftBanner with RepoContext from correct workspace. AC-1 through AC-12 all pass."
    - [x] Create integration test suite: `packages/superconductor-core/src/__tests__/integration/setup-intelligence-flow.test.ts` [TIER-1:TCS=3]
    - [x] Test scenarios: TypeScript monorepo, Python project, Go service, Rust crate, fresh 0-commit repo [TIER-1:TCS=3]
    - [x] Verify AC-5 (no throw on missing hotspots), AC-6 (cli-blueprint.js outputs JSON), AC-8 (commit hook doesn't crash), AC-9 (subfolder cli-update writes to git root) [TIER-1:TCS=3]

- [x] Task: AC-10 compliance audit — grep for banned paths [TIER-1:TCS=3] [AGENT:superconductor-processor]
    INVARIANT_AFTER: "Zero occurrences of '~/.gemini/extensions/superconductor' in any file under skills/ or packages/."
    - [x] Run `grep -r '~/.gemini/extensions/superconductor' skills/ packages/ --include='*.md' --include='*.ts'` [TIER-1:TCS=3]
    - [x] All findings resolved to zero [TIER-1:TCS=3]

- [x] Task: UX quorum self-audit — run `ux-reviewer` against all modified skill files [TIER-3:TCS=3] [AGENT:superconductor-reviewer]
    INVARIANT_AFTER: "UxRuleEngine.evaluate() returns PASS or zero unresolved CRITICAL/HIGH findings across: setup/SKILL.md, new-track/SKILL.md, coding-agent/SKILL.md, standalone-review/SKILL.md, ux-reviewer/SKILL.md. AC-11 and AC-12 verified."
    - [x] Run UX reviewer in QUORUM mode against each modified skill file [TIER-1:TCS=3]
    - [x] Resolve any NEEDS_FIXES findings before proceeding [TIER-1:TCS=3]

- [x] Task: Integrate track 'intelligence_setup_fix_20260920' into main branch [TIER-4:TCS=3] [AGENT:superconductor-oracle]
    - [x] Verify clean working copy (`git status --porcelain`) [TIER-1:TCS=3]
    - [x] Run full test suite; confirm >80% coverage [TIER-1:TCS=3]
    - [x] Run 5-reviewer quorum (correctness + adversarial + security + regression + ux-reviewer) [TIER-1:TCS=3]
    - [x] Oracle gate: `QuorumValidator.gateOracle({ quorumPassed })` [TIER-1:TCS=3]
    - [x] No-ff merge to main with Swarm Authorizer trailer [TIER-1:TCS=3]
    - [x] Archive track to `superconductor/tracks/archive/intelligence_setup_fix_20260920` [TIER-1:TCS=3]
