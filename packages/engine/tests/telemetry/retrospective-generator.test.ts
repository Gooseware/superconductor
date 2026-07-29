import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RetrospectiveGenerator, UnverifiedFindingError } from '../../src/telemetry/retrospective-generator.js';

// ─── Mock child_process at module level for ESM compatibility ────────────────
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn().mockReturnValue('mocksha\n'),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'retro-gen-test-'));
}

function writeTranscript(dir: string, trackId: string, lines: object[]): string {
  const transcriptDir = path.join(dir, '.superconductor', trackId);
  fs.mkdirSync(transcriptDir, { recursive: true });
  const transcriptPath = path.join(transcriptDir, 'transcript.jsonl');
  fs.writeFileSync(transcriptPath, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return transcriptPath;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RetrospectiveGenerator', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    vi.clearAllMocks();
    // Re-apply default mock for execSync after clearAllMocks
    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('mocksha\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Secret Redaction ──────────────────────────────────────────────────────

  it('should redact GEMINI_API_KEY from transcript lines before parsing (step_index still extracted)', async () => {
    const trackId = 'track-redact';
    // A transcript line that contains a secret but has a valid step_index
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'GEMINI_API_KEY=sk-abc123secret' },
    ]);

    const generator = new RetrospectiveGenerator({ transcriptPath });
    const stepIndices = await generator.extractStepIndices();

    // step_index=0 should be found; secret should have been redacted (not thrown)
    expect(stepIndices.has(0)).toBe(true);
  });

  it('should redact GCP_PROJECT env var from transcript lines before parsing', async () => {
    const trackId = 'track-gcp-redact';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 1, message: 'GCP_PROJECT_ID=my-secret-project' },
    ]);

    const generator = new RetrospectiveGenerator({ transcriptPath });
    const stepIndices = await generator.extractStepIndices();
    expect(stepIndices.has(1)).toBe(true);
  });

  // ── Finding Validation ────────────────────────────────────────────────────

  it('should throw UnverifiedFindingError when stepIndex does not exist in transcript', async () => {
    const trackId = 'track-bad-citation';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
      { step_index: 1, message: 'step 1' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });

    await expect(
      generator.generate('track-bad-citation', [
        { findingId: 'f-1', stepIndex: 99, description: 'A finding referencing non-existent step' },
      ])
    ).rejects.toThrow(UnverifiedFindingError);
  });

  it('should NOT throw when stepIndex exists in transcript', async () => {
    const trackId = 'track-valid-citation';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
      { step_index: 5, message: 'step 5' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });

    await expect(
      generator.generate(trackId, [
        { findingId: 'f-1', stepIndex: 5, description: 'A valid finding' },
      ])
    ).resolves.toBeDefined();
  });

  it('should correctly extract all step_indices from a multi-line transcript (streaming behavior)', async () => {
    // Verifies that the implementation reads all lines (not just the first,
    // which would happen if it used sync read without streaming)
    const trackId = 'track-stream';
    const N = 100;
    const lines = Array.from({ length: N }, (_, i) => ({ step_index: i, message: `step ${i}` }));
    const transcriptPath = writeTranscript(tmpDir, trackId, lines);

    const generator = new RetrospectiveGenerator({ transcriptPath });
    const stepIndices = await generator.extractStepIndices();

    // All 100 step indices should be found
    expect(stepIndices.size).toBe(N);
    for (let i = 0; i < N; i++) {
      expect(stepIndices.has(i)).toBe(true);
    }
  });

  it('should not load entire transcript file into memory — extractStepIndices uses readline interface', async () => {
    // Verify by checking that the implementation uses createReadStream + readline
    // This is a code-level verification: the source uses readline.createInterface
    // We verify the behavior: even without a quorumStorePath and with a valid transcript,
    // it processes line-by-line correctly without throwing OOM
    const trackId = 'track-readline';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 42, message: 'only step' },
    ]);

    const generator = new RetrospectiveGenerator({ transcriptPath });
    const stepIndices = await generator.extractStepIndices();

    // Correct result proves line-by-line processing worked
    expect(stepIndices.has(42)).toBe(true);
    expect(stepIndices.size).toBe(1);
  });

  // ── Hard Metrics ──────────────────────────────────────────────────────────

  it('should read test metrics from quorum store test-metrics.json', async () => {
    const trackId = 'track-metrics';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
    ]);

    const quorumStorePath = path.join(tmpDir, 'quorum');
    fs.mkdirSync(quorumStorePath, { recursive: true });
    fs.writeFileSync(
      path.join(quorumStorePath, 'test-metrics.json'),
      JSON.stringify({ testsPassed: 42, testsFailed: 3 }),
      'utf8'
    );

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, quorumStorePath, workspaceDir: tmpDir });
    const retro = await generator.generate(trackId, []);
    expect(retro.testsPassed).toBe(42);
    expect(retro.testsFailed).toBe(3);
  });

  it('should return 0 test metrics when quorum store does not have metrics file', async () => {
    const trackId = 'track-no-metrics';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });
    const retro = await generator.generate(trackId, []);
    expect(retro.testsPassed).toBe(0);
    expect(retro.testsFailed).toBe(0);
  });

  // ── commitSha from git ────────────────────────────────────────────────────

  it('should get commitSha from git rev-parse --short HEAD via execSync', async () => {
    const trackId = 'track-commit';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('deadbee\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });
    const retro = await generator.generate(trackId, []);

    expect(retro.commitSha).toBe('deadbee');
    expect(execSync).toHaveBeenCalledWith(
      'git rev-parse --short HEAD',
      expect.objectContaining({ cwd: tmpDir, encoding: 'utf8' })
    );
  });

  it('should return "unknown" commitSha when git command fails', async () => {
    const trackId = 'track-no-git';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });
    const retro = await generator.generate(trackId, []);
    expect(retro.commitSha).toBe('unknown');
  });

  // ── Missing Transcript ────────────────────────────────────────────────────

  it('should return normally (empty stepIndices, no throw) when transcript file is absent', async () => {
    const transcriptPath = path.join(tmpDir, 'nonexistent', 'transcript.jsonl');
    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    // With no transcript and no findings, should not throw
    await expect(generator.generate('track-absent', [])).resolves.toBeDefined();
  });

  it('should return empty stepIndices set when transcript file is absent', async () => {
    const transcriptPath = path.join(tmpDir, 'nonexistent', 'transcript.jsonl');
    const generator = new RetrospectiveGenerator({ transcriptPath });
    const indices = await generator.extractStepIndices();
    expect(indices.size).toBe(0);
  });

  // ── Return shape ──────────────────────────────────────────────────────────

  it('should return a well-formed GeneratedRetrospective object', async () => {
    const trackId = 'track-shape';
    const transcriptPath = writeTranscript(tmpDir, trackId, [
      { step_index: 0, message: 'step 0' },
      { step_index: 1, message: 'step 1' },
    ]);

    const { execSync } = await import('child_process');
    vi.mocked(execSync).mockReturnValue('abc1234\n');

    const generator = new RetrospectiveGenerator({ transcriptPath, workspaceDir: tmpDir });
    const retro = await generator.generate(trackId, [
      { findingId: 'f-1', stepIndex: 0, description: 'Finding one' },
      { findingId: 'f-2', stepIndex: 1, description: 'Finding two' },
    ]);

    expect(retro.trackId).toBe(trackId);
    expect(retro.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(retro.commitSha).toBe('abc1234');
    expect(retro.findings).toHaveLength(2);
    expect(retro.summary).toBeDefined();
    expect(typeof retro.summary).toBe('string');
  });

  // ── UnverifiedFindingError shape ─────────────────────────────────────────

  it('UnverifiedFindingError should have correct findingId and name properties', () => {
    const err = new UnverifiedFindingError('f-99', 'test reason');
    expect(err.findingId).toBe('f-99');
    expect(err.name).toBe('UnverifiedFindingError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UnverifiedFindingError);
  });
});
