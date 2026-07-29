import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { execSync } from 'child_process';
import { redactSecrets } from './secret-redactor.js';

export class UnverifiedFindingError extends Error {
  constructor(public readonly findingId: string, public readonly reason: string) {
    super(`Unverified finding '${findingId}': ${reason}`);
    this.name = 'UnverifiedFindingError';
    Object.setPrototypeOf(this, UnverifiedFindingError.prototype);
  }
}

export interface RetroFinding {
  findingId: string;
  stepIndex: number;   // Must reference a real step_index from transcript
  description: string;
}

export interface RetrospectiveOptions {
  transcriptPath: string;
  quorumStorePath?: string;
  workspaceDir?: string;
  secretPatterns?: RegExp[];
}

export interface GeneratedRetrospective {
  trackId: string;
  generatedAt: string;
  commitSha: string;
  testsPassed: number;
  testsFailed: number;
  findings: RetroFinding[];
  summary: string; // qualitative, LLM-generated — grounded in above data
}

export class RetrospectiveGenerator {
  constructor(private readonly options: RetrospectiveOptions) {}

  /**
   * Generates a grounded retrospective by:
   * 1. Streaming transcript.jsonl (never loads full file)
   * 2. Extracting verified step_index values
   * 3. Redacting secrets from all text before processing
   * 4. Sourcing hard metrics from git log and quorum store
   */
  async generate(trackId: string, findings: RetroFinding[]): Promise<GeneratedRetrospective> {
    // Step 1: Stream transcript to extract real step indices
    const realStepIndices = await this.extractStepIndices();

    // Step 2: Validate all finding citations against real step indices
    for (const finding of findings) {
      if (!realStepIndices.has(finding.stepIndex)) {
        throw new UnverifiedFindingError(
          finding.findingId,
          `step_index ${finding.stepIndex} does not exist in transcript`
        );
      }
    }

    // Step 3: Get hard metrics from git (not from memory)
    const commitSha = this.getCommitSha();

    // Step 4: Get test metrics from quorum store
    const { testsPassed, testsFailed } = this.getTestMetrics();

    let summary = `Track ${trackId} completed. ${findings.length} finding(s) recorded with verified citations.`;
    if (process.env.GEMINI_API_KEY) {
      let _llmFailed = false;
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `Generate a qualitative summary for track ${trackId}. Tests passed: ${testsPassed}, failed: ${testsFailed}. Findings:\n${JSON.stringify(findings, null, 2)}`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        if (response.text) {
          summary = response.text;
        }
      } catch (_err) {
        _llmFailed = true;
      }
      if (_llmFailed) {
        console.error('[RetrospectiveGenerator] LLM generation failed (redacted).');
        summary += '\n\n(Note: LLM generation failed, falling back to template)';
      }
    }

    return {
      trackId,
      generatedAt: new Date().toISOString(),
      commitSha,
      testsPassed,
      testsFailed,
      findings,
      summary,
    };
  }

  /**
   * Streams transcript.jsonl line-by-line (never loads full file into memory).
   * Returns a Set of all real step_index values.
   * Applies secret redaction to all text.
   */
  async extractStepIndices(): Promise<Set<number>> {
    const stepIndices = new Set<number>();

    if (!fs.existsSync(this.options.transcriptPath)) {
      return stepIndices;
    }

    const fileStream = fs.createReadStream(this.options.transcriptPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      let _parseFailed = false;
      try {
        const redacted = redactSecrets(line, this.options.secretPatterns);
        const parsed = JSON.parse(redacted) as { step_index?: number };
        if (typeof parsed.step_index === 'number') {
          stepIndices.add(parsed.step_index);
        }
      } catch (_err) { 
        _parseFailed = true; 
      }
      if (_parseFailed) {
        console.warn('Skipping malformed line');
      }
    }

    return stepIndices;
  }

  private getCommitSha(): string {
    let _shaFailed = false;
    let _shaResult = 'unknown';
    try {
      _shaResult = execSync('git rev-parse --short HEAD', {
        cwd: this.options.workspaceDir ?? process.cwd(),
        encoding: 'utf8',
      }).trim();
    } catch (_err) { 
      _shaFailed = true; 
    }
    if (_shaFailed) {
      console.warn('Failed to get commit SHA');
      return 'unknown';
    }
    return _shaResult;
  }

  private getTestMetrics(): { testsPassed: number; testsFailed: number } {
    // Read from quorum store metrics file if available
    if (this.options.quorumStorePath) {
      let _metricsFailed = false;
      let _metricsResult = { testsPassed: 0, testsFailed: 0 };
      try {
        const metricsPath = path.join(this.options.quorumStorePath, 'test-metrics.json');
        const raw = fs.readFileSync(metricsPath, 'utf8');
        _metricsResult = JSON.parse(raw) as { testsPassed: number; testsFailed: number };
      } catch (_err) { 
        _metricsFailed = true; 
      }
      if (_metricsFailed) {
        console.warn('Failed to read test metrics');
      } else {
        return _metricsResult;
      }
    }
    return { testsPassed: 0, testsFailed: 0 };
  }
}
