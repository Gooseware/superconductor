/**
 * TrajectoryHarvester
 *
 * Harvests execution trajectories, tool interactions, and quorum review states
 * from completed tracks and live session event logs.
 *
 * Invariant: Harvester MUST serialize execution traces asynchronously without
 * blocking active swarm execution.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import {
  ExecutionStep,
  QuorumFeedback,
  ExperienceRecord,
  HarvesterOptions,
  RemediationPair,
} from './types.js';
import { TrajectorySanitizer } from './sanitizer.js';
import { TranscriptParser } from './transcript-parser.js';

export class TrajectoryHarvester {
  private static readonly DEFAULT_STORAGE_DIR = path.join(
    process.cwd(),
    '.superconductor',
    'learning',
    'trajectories'
  );

  /**
   * Ingest a transcript.jsonl file directly and parse into sanitized ExecutionSteps.
   */
  public static async harvestTranscript(
    transcriptPath: string
  ): Promise<ExecutionStep[]> {
    try {
      const content = await fs.readFile(transcriptPath, 'utf8');
      return TranscriptParser.parseTranscript(content);
    } catch {
      return [];
    }
  }

  /**
   * Safe git revision regex matching valid git revision specifiers
   * (e.g., commit SHAs, branch names, tags, reflog/relative references like HEAD~1, HEAD@{1}).
   * Disallows leading hyphens (flags), whitespace, and shell metacharacters.
   */
  public static readonly SAFE_GIT_REVISION_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.~^/@{}:-]*$/;

  /**
   * Validates whether a given revision string is safe to pass to git diff.
   * Rejects non-string, empty, leading-hyphen, whitespace, and shell metacharacter inputs.
   */
  public static isValidGitRevision(rev: unknown): boolean {
    if (typeof rev !== 'string' || !rev) {
      return false;
    }
    if (rev.startsWith('-')) {
      return false;
    }
    return this.SAFE_GIT_REVISION_REGEX.test(rev);
  }

  /**
   * Safely extracts git diff between two commits using git diff.
   */
  public static async harvestRemediationDiff(
    preCommit: string,
    postCommit: string,
    options?: { repoRoot?: string }
  ): Promise<string> {
    if (!this.isValidGitRevision(preCommit) || !this.isValidGitRevision(postCommit)) {
      return '';
    }

    const repoRoot = options?.repoRoot ?? process.cwd();
    return new Promise((resolve) => {
      execFile(
        'git',
        ['diff', `${preCommit}..${postCommit}`, '--'],
        { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            resolve('');
          } else {
            resolve(stdout ?? '');
          }
        }
      );
    });
  }

  /**
   * Harvest track directory artifacts (spec.md, plan.md, metadata.json, quorum state)
   * and synthesize an ExperienceRecord.
   */
  public static async harvestTrack(
    trackPath: string,
    options?: HarvesterOptions
  ): Promise<ExperienceRecord | null> {
    try {
      const stat = await fs.stat(trackPath);
      if (!stat.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    const trackBasename = path.basename(trackPath);
    let trackId = trackBasename;
    let goal = `Track ${trackBasename}`;
    let tags: string[] = ['track', 'harvested'];
    let metadata: Record<string, unknown> | undefined = undefined;
    let outcome: 'success' | 'failure' = 'success';
    let timestamp = Date.now();
    let steps: ExecutionStep[] = [];
    const quorumReviews: QuorumFeedback[] = [];
    let preCommit = options?.preCommit ?? options?.remediationHarvestOptions?.preCommit;
    let postCommit = options?.postCommit ?? options?.remediationHarvestOptions?.postCommit;
    const repoRoot = options?.repoRoot ?? options?.remediationHarvestOptions?.repoRoot;

    // 1. Read metadata.json if present
    const metadataPath = path.join(trackPath, 'metadata.json');
    try {
      const rawMeta = await fs.readFile(metadataPath, 'utf8');
      const parsedMeta = JSON.parse(rawMeta);
      if (parsedMeta && typeof parsedMeta === 'object') {
        metadata = parsedMeta;
        if (typeof parsedMeta.trackId === 'string' && parsedMeta.trackId) {
          trackId = parsedMeta.trackId;
        }
        if (typeof parsedMeta.goal === 'string' && parsedMeta.goal) {
          goal = parsedMeta.goal;
        }
        if (Array.isArray(parsedMeta.tags)) {
          tags = parsedMeta.tags.map(String);
        }
        if (parsedMeta.outcome === 'success' || parsedMeta.outcome === 'failure') {
          outcome = parsedMeta.outcome;
        }
        if (typeof parsedMeta.timestamp === 'number') {
          timestamp = parsedMeta.timestamp;
        }
        if (Array.isArray(parsedMeta.steps)) {
          steps = parsedMeta.steps;
        }
        if (Array.isArray(parsedMeta.quorumReviews)) {
          for (const qr of parsedMeta.quorumReviews) {
            quorumReviews.push(this.normalizeQuorumFeedback(qr));
          }
        }
        if (!preCommit && typeof parsedMeta.preCommit === 'string') {
          preCommit = parsedMeta.preCommit;
        }
        if (!postCommit && typeof parsedMeta.postCommit === 'string') {
          postCommit = parsedMeta.postCommit;
        }
      }
    } catch {
      // metadata.json is optional
    }

    // 2. Read spec.md if present
    const specPath = path.join(trackPath, 'spec.md');
    try {
      const specContent = await fs.readFile(specPath, 'utf8');
      const trackIdMatch = specContent.match(/\*\*Track ID:\*\*\s*`?([^\`\r\n]+)`?/i);
      if (trackIdMatch && (!metadata || !metadata.trackId)) {
        trackId = trackIdMatch[1].trim();
      }

      const typeMatch = specContent.match(/\*\*Type:\*\*\s*([^\r\n]+)/i);
      if (typeMatch && !tags.includes(typeMatch[1].trim().toLowerCase())) {
        tags.push(typeMatch[1].trim().toLowerCase());
      }

      // Extract goal if not provided in metadata
      if (!metadata || !metadata.goal) {
        const titleMatch = specContent.match(/^#\s+(?:Spec:\s*)?([^\r\n]+)/m);
        const overviewMatch = specContent.match(/##\s+Overview\s*\n+([^\r\n#]+)/i);
        if (overviewMatch) {
          goal = overviewMatch[1].trim();
        } else {
          const lines = specContent.split('\n');
          const descLines: string[] = [];
          for (const line of lines) {
            const trimmed = line.trim();
            if (
              !trimmed ||
              trimmed.startsWith('#') ||
              trimmed.startsWith('**') ||
              trimmed.startsWith('---')
            ) {
              continue;
            }
            descLines.push(trimmed);
          }
          const title = titleMatch ? titleMatch[1].trim() : '';
          if (descLines.length > 0) {
            goal = title ? `${title}: ${descLines.join(' ')}` : descLines.join(' ');
          } else if (title) {
            goal = title;
          }
        }
      }
    } catch {
      // spec.md is optional
    }

    // 3. Ingest transcript.jsonl if available and steps not already extracted from metadata
    if (steps.length === 0) {
      const transcriptCandidates: string[] = [];
      if (options?.transcriptPath) {
        transcriptCandidates.push(options.transcriptPath);
      }
      if (options?.remediationHarvestOptions?.transcriptPath) {
        transcriptCandidates.push(options.remediationHarvestOptions.transcriptPath);
      }
      transcriptCandidates.push(
        path.join(trackPath, 'transcript.jsonl'),
        path.join(trackPath, '.superconductor', 'transcript.jsonl'),
        path.join(trackPath, '.superconductor', 'logs', 'transcript.jsonl'),
        path.join(trackPath, 'logs', 'transcript.jsonl'),
        path.join(process.cwd(), '.superconductor', 'logs', `${trackId}-transcript.jsonl`),
        path.join(process.cwd(), '.superconductor', 'logs', 'transcript.jsonl'),
        path.join(process.cwd(), '.superconductor', trackId, 'transcript.jsonl')
      );

      for (const candidate of transcriptCandidates) {
        try {
          const stat = await fs.stat(candidate);
          if (stat.isFile()) {
            const transcriptSteps = await this.harvestTranscript(candidate);
            if (transcriptSteps.length > 0) {
              steps = transcriptSteps;
              break;
            }
          }
        } catch {
          // Candidate file not found or unreadable, try next
        }
      }
    }

    // 4. Read plan.md if present (and extract tasks as steps ONLY if no steps in metadata or transcript)
    const planPath = path.join(trackPath, 'plan.md');
    try {
      const planContent = await fs.readFile(planPath, 'utf8');
      if (!trackId || trackId === trackBasename) {
        const trackIdMatch = planContent.match(/\*\*Track ID:\*\*\s*`?([^\`\r\n]+)`?/i);
        if (trackIdMatch) {
          trackId = trackIdMatch[1].trim();
        }
      }

      if (steps.length === 0) {
        const taskRegex = /^\s*-\s*\[([ xX])\]\s*(?:Task:\s*)?([^\r\n]+)/gm;
        let match: RegExpExecArray | null;
        let index = 0;
        let hasIncomplete = false;

        while ((match = taskRegex.exec(planContent)) !== null) {
          const isDone = match[1].toLowerCase() === 'x';
          const taskDesc = match[2].trim();
          if (!isDone) {
            hasIncomplete = true;
          }
          steps.push({
            stepIndex: index++,
            tool: 'plan_task',
            input: taskDesc,
            output: isDone ? 'completed' : 'pending',
            status: 'success',
          });
        }

        if (!metadata?.outcome && hasIncomplete && quorumReviews.length === 0) {
          outcome = 'failure';
        }
      }
    } catch {
      // plan.md is optional
    }

    // 5. Read quorum state if present
    const potentialQuorumFiles = [
      'quorum-state.json',
      'quorum_reviews.json',
      'quorum.json',
      path.join('quorum', 'quorum-state.json'),
      path.join('quorum', 'state.json'),
    ];
    for (const qFile of potentialQuorumFiles) {
      const qPath = path.join(trackPath, qFile);
      try {
        const qContent = await fs.readFile(qPath, 'utf8');
        const qJson = JSON.parse(qContent);
        const reviewList = Array.isArray(qJson.reviews)
          ? qJson.reviews
          : Array.isArray(qJson)
          ? qJson
          : [];

        for (const item of reviewList) {
          quorumReviews.push(this.normalizeQuorumFeedback(item));
        }
      } catch {
        // file doesn't exist or invalid JSON, continue
      }
    }

    // Check if outcome should be inferred from quorum verdicts if not explicitly specified
    if (!metadata?.outcome && quorumReviews.length > 0) {
      const hasNeedsFixes = quorumReviews.some(r => r.verdict === 'NEEDS_FIXES');
      outcome = hasNeedsFixes ? 'failure' : 'success';
    }

    // 6. Extract remediation pairs from steps
    let remediationPairs: RemediationPair[] = [];
    if (steps.length > 0) {
      remediationPairs = TranscriptParser.extractFailureRemediationPairs(steps);
    }

    // Attach diff hunk from git if preCommit and postCommit are provided
    if (preCommit && postCommit) {
      const diffHunk = await this.harvestRemediationDiff(preCommit, postCommit, { repoRoot });
      if (diffHunk && remediationPairs.length > 0) {
        for (const pair of remediationPairs) {
          if (!pair.diffHunk) {
            pair.diffHunk = diffHunk;
          }
        }
      }
    }

    // Apply maxSteps if specified
    if (options?.maxSteps !== undefined && options.maxSteps > 0 && steps.length > options.maxSteps) {
      steps = steps.slice(0, options.maxSteps);
    }

    let record: ExperienceRecord = {
      id: `exp-${trackId}-${timestamp}`,
      trackId,
      timestamp,
      goal,
      steps,
      quorumReviews,
      outcome,
      tags,
      metadata,
      ...(remediationPairs.length > 0 ? { remediationPairs } : {}),
    };

    // Redact sensitive tokens unless explicitly opted out
    if (options?.redactSensitive !== false) {
      record = TrajectorySanitizer.sanitizeObject(record);
    }

    return record;
  }

  /**
   * Extracts an ExperienceRecord from an array of raw session/agent events.
   */
  public static extractFromSession(
    sessionId: string,
    events: unknown[],
    options?: HarvesterOptions
  ): ExperienceRecord {
    let goal = `Session ${sessionId}`;
    let outcome: 'success' | 'failure' = 'success';
    let tags: string[] = ['session', 'harvested'];
    let steps: ExecutionStep[] = [];
    const quorumReviews: QuorumFeedback[] = [];
    const metadata: Record<string, unknown> = { sessionId };
    let stepCounter = 0;

    if (Array.isArray(events)) {
      for (const rawEvent of events) {
        if (!rawEvent || typeof rawEvent !== 'object') continue;

        const event = rawEvent as Record<string, any>;

        // Goal event
        if (event.type === 'goal' || typeof event.goal === 'string') {
          goal = String(event.goal);
          continue;
        }

        // Outcome event
        if (event.type === 'outcome' || event.outcome !== undefined) {
          if (event.outcome === 'success' || event.outcome === 'failure') {
            outcome = event.outcome;
          }
          if (Array.isArray(event.tags)) {
            tags = event.tags.map(String);
          }
          continue;
        }

        // Quorum feedback event
        if (
          event.type === 'quorum_feedback' ||
          event.type === 'quorum_review' ||
          event.reviewerRole !== undefined
        ) {
          quorumReviews.push(this.normalizeQuorumFeedback(event));
          continue;
        }

        // Execution step event
        if (
          event.tool !== undefined ||
          event.toolName !== undefined ||
          event.type === 'tool_call' ||
          event.type === 'tool_execution' ||
          event.type === 'step' ||
          event.stepIndex !== undefined
        ) {
          const tool =
            event.tool ?? event.name ?? event.toolName ?? 'unknown_tool';
          const input =
            event.input !== undefined
              ? event.input
              : event.args !== undefined
              ? event.args
              : event.parameters;
          const output =
            event.output !== undefined
              ? event.output
              : event.result !== undefined
              ? event.result
              : event.response;
          const status = event.status === 'error' || event.error ? 'error' : 'success';
          const durationMs =
            typeof event.durationMs === 'number'
              ? event.durationMs
              : typeof event.duration === 'number'
              ? event.duration
              : undefined;

          steps.push({
            stepIndex: typeof event.stepIndex === 'number' ? event.stepIndex : stepCounter++,
            tool: String(tool),
            input,
            output,
            status,
            durationMs,
          });
        }
      }
    }

    // Apply maxSteps option
    if (options?.maxSteps !== undefined && options.maxSteps > 0 && steps.length > options.maxSteps) {
      steps = steps.slice(0, options.maxSteps);
    }

    const remediationPairs =
      steps.length > 0 ? TranscriptParser.extractFailureRemediationPairs(steps) : [];

    let record: ExperienceRecord = {
      id: `session-${sessionId}-${Date.now()}`,
      trackId: sessionId,
      timestamp: Date.now(),
      goal,
      steps,
      quorumReviews,
      outcome,
      tags,
      metadata,
      ...(remediationPairs.length > 0 ? { remediationPairs } : {}),
    };

    if (options?.redactSensitive !== false) {
      record = TrajectorySanitizer.sanitizeObject(record);
    }

    return record;
  }

  /**
   * Save an ExperienceRecord to disk asynchronously.
   * Defaults to `.superconductor/learning/trajectories/<trackId>-<timestamp>.json`.
   */
  public static async saveRecord(
    record: ExperienceRecord,
    storageDir?: string
  ): Promise<string> {
    const targetDir = storageDir ?? this.DEFAULT_STORAGE_DIR;
    await fs.mkdir(targetDir, { recursive: true });

    const safeTrackId = (record.trackId || 'unknown').replace(/[/\\?%*:|"<>]/g, '_');
    const fileName = `${safeTrackId}-${record.timestamp}.json`;
    const targetPath = path.join(targetDir, fileName);

    const serialized = JSON.stringify(record, null, 2);
    await fs.writeFile(targetPath, serialized, 'utf8');

    return targetPath;
  }

  /**
   * Helper to normalize raw quorum feedback objects into typed QuorumFeedback.
   */
  private static normalizeQuorumFeedback(raw: any): QuorumFeedback {
    const reviewerRole = String(raw?.reviewerRole ?? raw?.role ?? raw?.reviewer ?? 'reviewer');
    const verdictStr = String(raw?.verdict ?? 'RESOLVED').toUpperCase();
    const verdict: 'RESOLVED' | 'NEEDS_FIXES' =
      verdictStr.includes('FIX') ||
      verdictStr.includes('FAIL') ||
      verdictStr.includes('REJECT')
        ? 'NEEDS_FIXES'
        : 'RESOLVED';

    let findings: string[] = [];
    if (Array.isArray(raw?.findings)) {
      findings = raw.findings.map((f: any) =>
        typeof f === 'string' ? f : (f?.message ?? f?.finding ?? JSON.stringify(f))
      );
    } else if (typeof raw?.findings === 'string' && raw.findings) {
      findings = [raw.findings];
    } else if (typeof raw?.finding === 'string' && raw.finding) {
      findings = [raw.finding];
    }

    return {
      reviewerRole,
      verdict,
      findings,
    };
  }
}
