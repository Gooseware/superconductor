import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LanceDBNotebookProvider } from '../../src/providers/lancedb-notebook-provider.js';
import { ValidationError, UnauthorizedNoteError } from '../../src/validation/notebook-validator.js';

describe('LanceDBNotebookProvider', () => {
  let tmpDir: string;
  let globalDir: string;
  let projectDir: string;
  let provider: LanceDBNotebookProvider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lancedb-test-'));
    globalDir = path.join(tmpDir, 'global');
    projectDir = path.join(tmpDir, 'project');
    provider = new LanceDBNotebookProvider({
      globalPath: globalDir,
      projectPath: projectDir,
    });
  });

  afterEach(async () => {
    await provider.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lazy loads embedding pipeline on first write or query', async () => {
    expect((provider as any).pipeline).toBeNull();
    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'core',
        files: ['a.ts'],
        note_type: 'warning',
        content: 'Test warning note',
        severity: 'warning',
      },
      { invocation_id: 'inv-lazy-1' }
    );
    expect((provider as any).pipeline).not.toBeNull();
  });

  it('runs validation engine before writing', async () => {
    // 281 char content should throw ValidationError
    await expect(
      provider.write({
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'core',
        files: ['a.ts'],
        note_type: 'warning',
        content: 'x'.repeat(281),
        severity: 'warning',
      })
    ).rejects.toThrow(ValidationError);

    // Quorum note without token should throw UnauthorizedNoteError
    await expect(
      provider.write({
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'core',
        files: ['a.ts'],
        note_type: 'quorum',
        content: 'Quorum verdict',
        severity: 'info',
      })
    ).rejects.toThrow(UnauthorizedNoteError);
  });

  it('performs exact SHA-256 deduplication', async () => {
    const note = {
      session_id: 's1',
      track_id: 't1',
      agent_role: 'processor',
      domain: 'core',
      files: ['a.ts'],
      note_type: 'warning' as const,
      content: 'Exact duplicate test note',
      severity: 'warning' as const,
    };

    const ack1 = await provider.write(note, { invocation_id: 'inv-dedup-1' });
    expect(ack1.deduplicated).toBe(false);

    const ack2 = await provider.write(note, { invocation_id: 'inv-dedup-2' });
    expect(ack2.deduplicated).toBe(true);
    expect(ack2.id).toBe(ack1.id);
  });

  it('queries notes with filters and vector search', async () => {
    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'security',
        files: ['auth.ts'],
        note_type: 'warning',
        content: 'Check auth token expiration',
        severity: 'critical',
      },
      { invocation_id: 'inv-q-1' }
    );

    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'ui',
        files: ['button.tsx'],
        note_type: 'preference',
        content: 'Prefer dark mode primary color',
        severity: 'info',
      },
      { user_confirmed: true }
    );

    const results = await provider.query({ domain: 'security' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Check auth token expiration');
  });

  it('provides a summary of entries by note_type', async () => {
    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'core',
        files: ['a.ts'],
        note_type: 'warning',
        content: 'Summary warning 1',
        severity: 'warning',
      },
      { invocation_id: 'inv-sum-1' }
    );

    const summary = await provider.summary('t1');
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.by_type.warning).toBeDefined();
    expect(summary.by_type.warning!.length).toBe(1);
  });

  it('performs cosine similarity deduplication for near-duplicate notes', async () => {
    const note1 = {
      session_id: 's1',
      track_id: 't1',
      agent_role: 'processor',
      domain: 'core',
      files: ['a.ts'],
      note_type: 'warning' as const,
      content: 'The database connection failed due to network timeout',
      severity: 'warning' as const,
    };

    const ack1 = await provider.write(note1, { invocation_id: 'inv-cos-1' });
    expect(ack1.deduplicated).toBe(false);

    const note2 = {
      session_id: 's1',
      track_id: 't1',
      agent_role: 'processor',
      domain: 'core',
      files: ['a.ts'],
      note_type: 'warning' as const,
      content: 'The database connection failed due to network timeout!',
      severity: 'warning' as const,
    };

    const ack2 = await provider.write(note2, { invocation_id: 'inv-cos-2' });
    expect(ack2.deduplicated).toBe(true);
    expect(ack2.id).toBe(ack1.id);
  });

  it('executes text vector query search without throwing', async () => {
    await provider.write(
      {
        session_id: 's1',
        track_id: 't1',
        agent_role: 'processor',
        domain: 'security',
        files: ['auth.ts'],
        note_type: 'warning',
        content: 'Check authentication token expiry in login module',
        severity: 'critical',
      },
      { invocation_id: 'inv-vec-1' }
    );

    const results = await provider.query({ query: 'authentication token login' });
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('authentication token');
  });
});
