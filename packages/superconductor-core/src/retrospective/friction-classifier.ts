import type { ProposalCategory } from '../schema/track-proposal.js';

export interface NoteLike {
  note_type?: string;
  content: string;
  severity?: string;
  domain?: string;
  files?: string[];
  track_id?: string;
  agent_role?: string;
  timestamp?: number;
}

export interface CycleMetrics {
  remediationCycles?: number;
  maxCycles?: number;
  totalSteps?: number;
  durationMs?: number;
}

export interface FrictionClassifierInput {
  trackId?: string;
  notes?: NoteLike[];
  errorCount?: number;
  cycleMetrics?: CycleMetrics;
  touchedFiles?: string[];
}

export interface FrictionCluster {
  id: string;
  category: ProposalCategory;
  title: string;
  description: string;
  confidence: number;
  evidenceNotes: NoteLike[];
  affectedFiles: string[];
  metrics: {
    remediationCycles?: number;
    errorCount?: number;
    noteCount: number;
  };
  suggestedAction: string;
}

export interface FrictionClassificationResult {
  clusters: FrictionCluster[];
  overallFrictionLevel: 'low' | 'medium' | 'high';
  dominantCategory: ProposalCategory | 'none';
  primaryProposalCandidate?: FrictionCluster;
}

const PROCESS_KEYWORDS = [
  'quorum',
  'reviewer',
  'remediation',
  'cycle',
  'timeout',
  'prompt',
  'drift',
  'flakiness',
  'flaky',
  'preflight',
  'gate',
  'hallucination',
  'subagent',
  'orchestrator',
  'dogma',
  'speculation',
  'unverified',
  'repro',
];

const CODEBASE_KEYWORDS = [
  'tech debt',
  'legacy',
  'refactor',
  'deprecated',
  'missing test',
  'untested',
  'leak',
  'memory leak',
  'coupling',
  'todo',
  'fixme',
  'hack',
  'sqlite',
  'migration',
  'type error',
  'exception',
  'unhandled',
  'null pointer',
];

function hasWordMatch(text: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

export class FrictionClassifier {
  /**
   * Classifies friction, groups findings into clusters, and computes confidence scores.
   */
  public classify(input: FrictionClassifierInput): FrictionClassificationResult {
    const notes = input.notes || [];
    const errorCount = input.errorCount || 0;
    const cycleMetrics = input.cycleMetrics || {};
    const remediationCycles = cycleMetrics.remediationCycles || 0;
    const touchedFiles = input.touchedFiles || [];
    const trackId = input.trackId || 'unknown_track';

    const processNotes: NoteLike[] = [];
    const codebaseNotes: NoteLike[] = [];

    for (const note of notes) {
      const text = (note.content || '').toLowerCase();
      const type = (note.note_type || '').toLowerCase();
      const domain = (note.domain || '').toLowerCase();

      if (domain === 'codebase') {
        codebaseNotes.push(note);
        continue;
      }
      if (domain === 'process') {
        processNotes.push(note);
        continue;
      }

      const isProcessSignal =
        type === 'quorum' ||
        PROCESS_KEYWORDS.some((kw) => hasWordMatch(text, kw));

      const isCodebaseSignal =
        (note.files && note.files.length > 0) ||
        CODEBASE_KEYWORDS.some((kw) => hasWordMatch(text, kw));

      if (isProcessSignal && !isCodebaseSignal) {
        processNotes.push(note);
      } else if (isCodebaseSignal && !isProcessSignal) {
        codebaseNotes.push(note);
      } else if (isProcessSignal && isCodebaseSignal) {
        // Evaluate keyword density
        const procHits = PROCESS_KEYWORDS.filter((kw) => hasWordMatch(text, kw)).length;
        const codeHits = CODEBASE_KEYWORDS.filter((kw) => hasWordMatch(text, kw)).length;
        if (procHits >= codeHits) {
          processNotes.push(note);
        } else {
          codebaseNotes.push(note);
        }
      } else {
        // Default classification based on type
        if (type === 'quorum' || type === 'procedure') {
          processNotes.push(note);
        } else {
          codebaseNotes.push(note);
        }
      }
    }

    const clusters: FrictionCluster[] = [];

    // 1. Process Friction Cluster
    if (processNotes.length > 0 || remediationCycles > 0) {
      const conf = this.computeConfidence({
        notes: processNotes,
        remediationCycles,
        errorCount,
        category: 'process',
      });

      const clusterFiles: string[] = [];
      for (const n of processNotes) {
        if (n.files) clusterFiles.push(...n.files);
      }

      clusters.push({
        id: `process_${trackId}`,
        category: 'process',
        title: `Improve Swarm Remediation & Quorum Protocol for ${trackId}`,
        description:
          processNotes.length > 0
            ? processNotes.map((n) => n.content).join('; ')
            : `Track encountered ${remediationCycles} remediation cycles.`,
        confidence: conf,
        evidenceNotes: processNotes,
        affectedFiles: Array.from(new Set(clusterFiles)),
        metrics: {
          remediationCycles,
          errorCount,
          noteCount: processNotes.length,
        },
        suggestedAction:
          'Harden reviewer prompts, tighten preflight invariant gates, or tune remediation loop timeout.',
      });
    }

    // 2. Codebase Friction Cluster
    if (codebaseNotes.length > 0) {
      const conf = this.computeConfidence({
        notes: codebaseNotes,
        remediationCycles: 0,
        errorCount,
        category: 'codebase',
      });

      const clusterFiles: string[] = [];
      for (const n of codebaseNotes) {
        if (n.files) clusterFiles.push(...n.files);
      }
      if (clusterFiles.length === 0 && touchedFiles.length > 0) {
        clusterFiles.push(...touchedFiles);
      }

      clusters.push({
        id: `codebase_${trackId}`,
        category: 'codebase',
        title: `Resolve Incidental Technical Debt & Missing Tests in ${trackId}`,
        description: codebaseNotes.map((n) => n.content).join('; '),
        confidence: conf,
        evidenceNotes: codebaseNotes,
        affectedFiles: Array.from(new Set(clusterFiles)),
        metrics: {
          remediationCycles: 0,
          errorCount,
          noteCount: codebaseNotes.length,
        },
        suggestedAction:
          'Refactor deprecated dependencies, decouple legacy schemas, and introduce dedicated unit tests.',
      });
    }

    // Sort clusters by confidence descending
    clusters.sort((a, b) => b.confidence - a.confidence);

    const primary = clusters[0];
    const maxConf = primary ? primary.confidence : 0.0;

    let overallFrictionLevel: 'low' | 'medium' | 'high' = 'low';
    if (maxConf >= 0.7 || remediationCycles >= 2) {
      overallFrictionLevel = 'high';
    } else if (maxConf >= 0.4 || errorCount > 0) {
      overallFrictionLevel = 'medium';
    }

    const dominantCategory = primary ? primary.category : 'none';

    return {
      clusters,
      overallFrictionLevel,
      dominantCategory,
      primaryProposalCandidate: primary,
    };
  }

  private computeConfidence(params: {
    notes: NoteLike[];
    remediationCycles: number;
    errorCount: number;
    category: ProposalCategory;
  }): number {
    const { notes, remediationCycles, errorCount, category } = params;
    let score = 0.0;

    const hasCritical = notes.some((n) => (n.severity || '').toLowerCase() === 'critical');
    const hasWarning = notes.some((n) => (n.severity || '').toLowerCase() === 'warning');
    const allInfo = notes.length > 0 && notes.every((n) => (n.severity || 'info').toLowerCase() === 'info');

    // Evidence volume
    if (notes.length === 1) {
      score += allInfo ? 0.25 : 0.40;
    } else if (notes.length === 2) {
      score += allInfo ? 0.40 : 0.60;
    } else if (notes.length >= 3) {
      score += 0.70;
    }

    // Severity weighting
    if (hasCritical) {
      score += 0.20;
    } else if (hasWarning) {
      score += 0.12;
    }

    // Remediation cycle metrics for process
    if (category === 'process') {
      if (remediationCycles >= 3) {
        score += 0.35;
      } else if (remediationCycles >= 2) {
        score += 0.25;
      } else if (remediationCycles >= 1) {
        score += 0.10;
      }
    }

    // Error count
    if (errorCount >= 3) {
      score += 0.18;
    } else if (errorCount >= 1) {
      score += 0.08;
    }

    // Multiple touched files reinforcement for codebase
    if (category === 'codebase') {
      const filesMentioned = notes.some((n) => n.files && n.files.length > 0);
      if (filesMentioned && notes.length >= 2) {
        score += 0.10;
      }
    }

    return Math.min(1.0, Math.max(0.0, Math.round(score * 100) / 100));
  }
}
