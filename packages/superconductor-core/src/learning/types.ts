/**
 * Learning Engine Core Types
 *
 * Defines the schemas for harvested trajectories, execution steps,
 * quorum feedbacks, and experience records.
 */

export interface ExecutionStep {
  stepIndex: number;
  tool: string;
  input: unknown;
  output: unknown;
  status: 'success' | 'error';
  durationMs?: number;
}

export interface QuorumFeedback {
  reviewerRole: string;
  verdict: 'RESOLVED' | 'NEEDS_FIXES';
  findings: string[];
}

export interface RemediationPair {
  id: string;
  domain?: string;
  finding?: string;
  failureStep?: ExecutionStep;
  errorSummary: string;
  resolutionSteps: ExecutionStep[];
  diffHunk?: string;
}

export interface RemediationHarvestOptions {
  transcriptPath?: string;
  preCommit?: string;
  postCommit?: string;
  repoRoot?: string;
}

export interface ExperienceRecord {
  id: string;
  trackId: string;
  timestamp: number;
  goal: string;
  steps: ExecutionStep[];
  quorumReviews: QuorumFeedback[];
  outcome: 'success' | 'failure';
  tags: string[];
  metadata?: Record<string, unknown>;
  remediationPairs?: RemediationPair[];
}

export interface HarvesterOptions {
  redactSensitive?: boolean;
  maxSteps?: number;
  transcriptPath?: string;
  preCommit?: string;
  postCommit?: string;
  repoRoot?: string;
  remediationHarvestOptions?: RemediationHarvestOptions;
}

export interface SynthesizedInvariant {
  invariant: string;
  severity: 'warning' | 'critical';
  domain: string;
  sourceFinding?: string;
}

export interface SynthesisOptions {
  trackId?: string;
  domain?: string;
  rootCause?: string;
  fixSummary?: string;
  severity?: 'warning' | 'critical';
  existingInvariants?: string[];
  strictGrammar?: boolean;
}

export interface DistilledSkill {
  name: string;
  description: string;
  content?: string;
  body?: string;
  sourceTrackId?: string;
  sourceTrack?: string;
  confidenceScore?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  learningMetadata?: Partial<IncubatingLearningMetadata>;
}

export interface DistillationOptions {
  allowFailure?: boolean;
  allowFailed?: boolean;
  allowTrivial?: boolean;
  minSteps?: number;
  minConfidence?: number;
  skillName?: string;
  description?: string;
  status?: string;
  vettingStatus?: string;
  harvestTimestamp?: string;
}

export interface SkillProvenanceMetadata {
  status?: string;
  source_track?: string;
  harvest_timestamp?: string;
  confidence_score?: number;
  vetting_status?: string;
}

export interface SkillTemplateData {
  name: string;
  description: string;
  sourceTrackId?: string;
  harvestTimestamp?: string;
  confidenceScore?: number;
  status?: string;
  vettingStatus?: string;
  provenance?: SkillProvenanceMetadata;
  title?: string;
  overview?: string;
  whenToUse?: string | string[];
  workflowProcedure?: string | string[];
  guidelinesInvariants?: string | string[];
  verification?: string | string[];
}

import type {
  DogmaValidationReport,
  DogmaViolation,
  DogmaValidationOptions,
  DogmaViolationSeverity,
  DogmaValidationStatus,
} from './dogma-validator.js';

export type { DeduplicationResult, SimilarityOptions } from './deduplicator.js';
export type {
  DogmaValidationReport,
  DogmaViolation,
  DogmaValidationOptions,
  DogmaViolationSeverity,
  DogmaValidationStatus,
};

export type VettingStatus = 'pending' | 'passed' | 'flagged' | 'rejected';

export interface IncubatingLearningMetadata {
  status: 'incubating' | string;
  source_track?: string;
  sourceTrack?: string;
  harvest_timestamp?: string;
  harvestTimestamp?: string;
  confidence_score?: number;
  confidenceScore?: number;
  vetting_status?: VettingStatus;
  vettingStatus?: VettingStatus;
  vetting_report?: unknown;
  vettingReport?: unknown;
  updated_at?: string;
  [key: string]: unknown;
}

export interface IncubatingSkillInfo {
  name: string;
  description: string;
  path: string;
  filePath: string;
  skillDir: string;
  directoryPath: string;
  content: string;
  body: string;
  frontmatter: Record<string, unknown>;
  learningMetadata?: IncubatingLearningMetadata;
  vettingStatus: VettingStatus;
  confidenceScore?: number;
  sourceTrack?: string;
  harvestTimestamp?: string;
  vettingReport?: unknown;
}

export interface SkillIncubationOptions {
  stagingDir?: string;
  projectRoot?: string;
}

export interface CanaryReport {
  passed: boolean;
  score: number;
  executionTimeMs: number;
  stepsExecuted: number;
  errors: string[];
  warnings: string[];
}

export interface CanaryOptions {
  timeoutMs?: number;
  maxSteps?: number;
  strictSyntax?: boolean;
  mockTools?: Record<string, (input: unknown, sandboxDir: string) => Promise<unknown> | unknown>;
  environment?: Record<string, string>;
  testPrompts?: string[];
  baseDir?: string;
  allowEmptySteps?: boolean;
}

export interface PromotionOptions {
  scope?: 'project' | 'global';
  projectRoot?: string;
  stagingDir?: string;
  globalDir?: string;
  globalSkillsDir?: string;
  allowWarnings?: boolean;
  trackId?: string;
  force?: boolean;
  canaryOptions?: CanaryOptions;
  dogmaOptions?: DogmaValidationOptions;
}

export interface PromotionResult {
  success: boolean;
  destinationPath?: string;
  targetPath?: string;
  scope: 'project' | 'global';
  skillName: string;
  reason?: string;
  error?: string;
}

