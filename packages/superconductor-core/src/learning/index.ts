/**
 * Continuous Learning Engine (CLE) Barrel Exports
 *
 * Exposes core learning pipeline components:
 * - TrajectorySanitizer: Redacts secrets, tokens, and PII from execution logs
 * - TrajectoryHarvester: Ingests track artifacts into ExperienceRecords
 * - InvariantDeduplicator: Fingerprinting and deduplication for synthesized invariants
 * - ReflectiveInvariantSynthesizer: Mines Quorum remediation cycles into invariants
 * - SkillTemplateGenerator: Standardized SKILL.md document generator
 * - WorkflowSkillDistiller: Distills execution traces into reusable skill candidates
 * - SkillIncubationManager: Staging quarantine area (.agents/skills/incubating/)
 * - SkillDogmaValidator: Static analysis, security screening, and Dogma enforcement
 * - CanaryHarness: Sandbox evaluation for candidate skills
 * - SkillPromoter: Promotion from incubation staging to project or global scope
 */

export * from './types.js';
export { TrajectorySanitizer } from './sanitizer.js';
export { TranscriptParser } from './transcript-parser.js';
export { TrajectoryHarvester } from './harvester.js';
export { InvariantDeduplicator } from './deduplicator.js';
export { ReflectiveInvariantSynthesizer } from './invariant-synthesizer.js';
export { SkillTemplateGenerator, generateSkillMarkdown } from './templates.js';
export { WorkflowSkillDistiller } from './skill-distiller.js';
export { SkillIncubationManager } from './incubation-manager.js';
export { SkillDogmaValidator } from './dogma-validator.js';
export { CanaryHarness } from './canary-harness.js';
export { SkillPromoter } from './promoter.js';
