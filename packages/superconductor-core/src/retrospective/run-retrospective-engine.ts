import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  TrackProposalBuilder,
  type BuildProposalResult,
  type TrackProposalInput,
} from './track-proposal-builder.js';
import {
  FrictionClassifier,
  type FrictionClassifierInput,
  type FrictionClassificationResult,
  type NoteLike,
} from './friction-classifier.js';

export interface FileDebtFinding {
  file: string;
  type: 'todo_fixme' | 'empty_catch' | 'missing_test' | 'deprecated_pattern';
  detail: string;
  line?: number;
}

export interface RunRetrospectiveInput {
  trackId: string;
  targetBranch?: string;
  touchedFiles?: string[];
  remediationCycles?: number;
  errorCount?: number;
  metrics?: Record<string, any>;
  notes?: NoteLike[];
}

export interface RetrospectiveResult {
  trackId: string;
  proposalsGenerated: BuildProposalResult[];
  savedProposalPaths: string[];
  confidence: number;
  frictionClassification: FrictionClassificationResult;
  notesAnalyzedCount: number;
  touchedFilesScannedCount: number;
  fileDebtFindings: FileDebtFinding[];
  skippedDueToLowConfidence: boolean;
}

export interface RunRetrospectiveEngineOptions {
  projectRoot?: string;
  suggestionsDir?: string;
  notebookQueryFn?: (params: {
    note_types?: string[];
    track_id?: string;
    [key: string]: any;
  }) => Promise<NoteLike[]>;
  notebookProvider?: any;
  proposalBuilder?: TrackProposalBuilder;
  frictionClassifier?: FrictionClassifier;
  confidenceThreshold?: number; // default: 0.70
  logger?: {
    log: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
}

export class RunRetrospectiveEngine {
  private projectRoot: string;
  private suggestionsDir: string;
  private notebookQueryFn?: (params: any) => Promise<NoteLike[]>;
  private notebookProvider?: any;
  private proposalBuilder: TrackProposalBuilder;
  private frictionClassifier: FrictionClassifier;
  private confidenceThreshold: number;
  private logger: { log: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };

  constructor(options: RunRetrospectiveEngineOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.suggestionsDir = options.suggestionsDir || path.join('superconductor', 'suggestions');
    this.notebookQueryFn = options.notebookQueryFn;
    this.notebookProvider = options.notebookProvider;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
    this.proposalBuilder =
      options.proposalBuilder ||
      new TrackProposalBuilder({
        projectRoot: this.projectRoot,
        suggestionsDir: this.suggestionsDir,
      });
    this.frictionClassifier = options.frictionClassifier || new FrictionClassifier();
    this.logger = options.logger || console;
  }

  /**
   * Runs the closed-loop post-run retrospective analysis.
   */
  public async run(input: RunRetrospectiveInput): Promise<RetrospectiveResult> {
    const trackId = input.trackId;
    this.logger.log(`[RunRetrospectiveEngine] Starting retrospective for track: ${trackId}`);

    // 1. Query notebook notes
    const rawNotes = await this.queryNotebookNotes(trackId, input.notes);

    // 2. Scan touched files for incidental tech debt or missing tests
    const touchedFiles = input.touchedFiles || [];
    const fileDebtFindings = await this.scanTouchedFiles(touchedFiles);

    // 3. Synthesize notes from file debt findings
    const debtNotes: NoteLike[] = fileDebtFindings.map((finding) => ({
      note_type: 'warning',
      content: finding.detail,
      domain: 'codebase',
      files: [finding.file],
      severity: finding.type === 'empty_catch' ? 'warning' : 'info',
      track_id: trackId,
    }));

    const allNotes = [...rawNotes, ...debtNotes];

    // 4. Classify friction
    const classifierInput: FrictionClassifierInput = {
      trackId,
      notes: allNotes,
      errorCount: input.errorCount || 0,
      cycleMetrics: {
        remediationCycles: input.remediationCycles || 0,
      },
      touchedFiles,
    };

    const classification = this.frictionClassifier.classify(classifierInput);
    const primaryCandidate = classification.primaryProposalCandidate;
    const maxConfidence = primaryCandidate ? primaryCandidate.confidence : 0.0;

    const proposalsGenerated: BuildProposalResult[] = [];
    const savedProposalPaths: string[] = [];

    // 5. Gate: Only generate proposals if confidence >= confidenceThreshold
    if (maxConfidence >= this.confidenceThreshold && classification.clusters.length > 0) {
      for (const cluster of classification.clusters) {
        if (cluster.confidence >= this.confidenceThreshold) {
          const proposalInput = this.buildProposalInput(trackId, cluster);
          const saved = await this.proposalBuilder.save(proposalInput);
          proposalsGenerated.push(saved.result);
          savedProposalPaths.push(saved.filePath);
          this.logger.log(
            `[RunRetrospectiveEngine] Proposal generated (confidence: ${cluster.confidence}): ${saved.filePath}`
          );
        }
      }
    }

    const skippedDueToLowConfidence = proposalsGenerated.length === 0;
    if (skippedDueToLowConfidence) {
      this.logger.log(
        `[RunRetrospectiveEngine] Retrospective completed with low confidence (${maxConfidence.toFixed(
          2
        )} < ${this.confidenceThreshold}). Skipped proposal generation.`
      );
    }

    return {
      trackId,
      proposalsGenerated,
      savedProposalPaths,
      confidence: maxConfidence,
      frictionClassification: classification,
      notesAnalyzedCount: allNotes.length,
      touchedFilesScannedCount: touchedFiles.length,
      fileDebtFindings,
      skippedDueToLowConfidence,
    };
  }

  /**
   * Queries notebook notes for quorum, warning, and procedure types.
   */
  private async queryNotebookNotes(trackId: string, preloadedNotes?: NoteLike[]): Promise<NoteLike[]> {
    if (preloadedNotes && preloadedNotes.length > 0) {
      return preloadedNotes;
    }

    if (this.notebookQueryFn) {
      try {
        return await this.notebookQueryFn({
          note_types: ['quorum', 'warning', 'procedure'],
          track_id: trackId,
        });
      } catch (err: any) {
        this.logger.warn(`[RunRetrospectiveEngine] notebookQueryFn failed: ${err.message}`);
      }
    }

    if (this.notebookProvider && typeof this.notebookProvider.query === 'function') {
      try {
        return await this.notebookProvider.query({
          note_types: ['quorum', 'warning', 'procedure'],
        });
      } catch (err: any) {
        this.logger.warn(`[RunRetrospectiveEngine] notebookProvider.query failed: ${err.message}`);
      }
    }

    // Attempt dynamic lookup of @superconductor/notebook-store
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const storeMod = await dynamicImport('@superconductor/notebook-store');
      if (storeMod && storeMod.createNotebookProvider) {
        const provider = await storeMod.createNotebookProvider(this.projectRoot);
        const entries = await provider.query({
          note_types: ['quorum', 'warning', 'procedure'],
        });
        await provider.close();
        return entries;
      }
    } catch {}

    return [];
  }

  /**
   * Scans touched files for incidental technical debt, empty catch blocks, or missing tests.
   */
  public async scanTouchedFiles(files: string[]): Promise<FileDebtFinding[]> {
    const findings: FileDebtFinding[] = [];

    for (const relFile of files) {
      const absPath = path.isAbsolute(relFile) ? relFile : path.join(this.projectRoot, relFile);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      // Check if code source file
      const isSourceCode =
        /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relFile) &&
        !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(relFile) &&
        !relFile.endsWith('.d.ts');

      if (!isSourceCode) {
        continue;
      }

      // Check for missing companion test
      const hasTest = this.hasCompanionTest(relFile, absPath);
      if (!hasTest) {
        findings.push({
          file: relFile,
          type: 'missing_test',
          detail: `Module '${relFile}' was touched but lacks a dedicated unit/integration test file.`,
        });
      }

      // Inspect file content
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const lines = content.split('\n');

        // Check for empty catch blocks
        const emptyCatchRegex = /catch\s*(\([^\)]*\))?\s*\{\s*\}/;
        if (emptyCatchRegex.test(content)) {
          for (let i = 0; i < lines.length; i++) {
            if (emptyCatchRegex.test(lines[i])) {
              findings.push({
                file: relFile,
                type: 'empty_catch',
                detail: `Empty catch block detected in '${relFile}' at line ${i + 1}.`,
                line: i + 1,
              });
              break;
            }
          }
        }

        // Check for TODO / FIXME / HACK
        const todoRegex = /\/\/\s*(TODO|FIXME|HACK):/i;
        for (let i = 0; i < lines.length; i++) {
          if (todoRegex.test(lines[i])) {
            const snippet = lines[i].trim();
            findings.push({
              file: relFile,
              type: 'todo_fixme',
              detail: `Incidental technical debt comment in '${relFile}' at line ${i + 1}: ${snippet}`,
              line: i + 1,
            });
            break;
          }
        }
      } catch (err: any) {
        this.logger.warn(`[RunRetrospectiveEngine] Failed reading ${relFile}: ${err.message}`);
      }
    }

    return findings;
  }

  /**
   * Checks whether a source file has a corresponding test file.
   */
  private hasCompanionTest(relFile: string, absPath: string): boolean {
    const dir = path.dirname(absPath);
    const parsed = path.parse(absPath);
    const ext = parsed.ext;
    const name = parsed.name;

    const candidateTests = [
      path.join(dir, `${name}.test${ext}`),
      path.join(dir, `${name}.spec${ext}`),
      path.join(dir, '__tests__', `${name}.test${ext}`),
      path.join(dir, '__tests__', `${name}.spec${ext}`),
      path.join(this.projectRoot, 'tests', relFile.replace(/\.(ts|tsx|js|jsx)$/, `.test${ext}`)),
      path.join(this.projectRoot, 'test', relFile.replace(/\.(ts|tsx|js|jsx)$/, `.test${ext}`)),
    ];

    return candidateTests.some((candidate) => fs.existsSync(candidate));
  }

  /**
   * Builds the structured proposal input from a friction cluster.
   */
  private buildProposalInput(trackId: string, cluster: any): TrackProposalInput {
    if (cluster.category === 'process') {
      return {
        title: cluster.title,
        category: 'process',
        origin: `Post-run retrospective of track ${trackId}`,
        sourceTrackId: trackId,
        confidence: cluster.confidence,
        tags: ['retrospective', 'swarm-process', 'quorum', 'remediation'],
        problemStatement:
          cluster.description ||
          `High friction and reviewer cycle overhead detected during track ${trackId} execution.`,
        proposedScope:
          cluster.suggestedAction ||
          'Harden reviewer prompt instructions, tighten invariant verification preflight gates, and optimize remediation turnaround.',
        affectedFiles: cluster.affectedFiles || [],
        deliverables: [
          'Harden reviewer prompt contracts and eliminate speculative findings',
          'Tighten preflight gate checks before launching review quorum',
          'Ensure remediation cycle convergence in <= 2 cycles',
        ],
        acceptanceCriteria: [
          'Remediation cycle count converges in <= 2 cycles',
          'Zero prompt drift during multi-cycle execution',
          'All blocking findings require executable reproduction scripts',
        ],
      };
    }

    // Codebase proposal
    return {
      title: cluster.title,
      category: 'codebase',
      origin: `Post-run retrospective of track ${trackId}`,
      sourceTrackId: trackId,
      confidence: cluster.confidence,
      tags: ['retrospective', 'tech-debt', 'codebase', 'refactoring'],
      problemStatement:
        cluster.description ||
        `Incidental technical debt, deprecated patterns, or missing tests were discovered in touched files during track ${trackId}.`,
      proposedScope:
        cluster.suggestedAction ||
        'Decouple legacy modules, eliminate swallowed exceptions, and introduce comprehensive test suites.',
      affectedFiles: cluster.affectedFiles || [],
      deliverables: [
        'Refactor legacy code patterns and decouple outdated schemas',
        'Introduce dedicated test suites for untested modules',
        'Replace swallowed catch blocks with explicit error policies',
      ],
      acceptanceCriteria: [
        'Unit test coverage added for all affected files',
        'All lint and typecheck errors resolved without shims',
        'Zero swallowed errors in modified files',
      ],
    };
  }
}
