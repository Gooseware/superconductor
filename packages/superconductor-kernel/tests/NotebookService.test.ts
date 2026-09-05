import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { NotebookService } from '../src/services/NotebookService.js';
import {
  ValidationError,
  UnauthorizedNoteError,
  AuthorityError,
  RateLimitError,
} from '@superconductor/notebook-store';

describe('NotebookService MCP Tools', () => {
  let tmpDir: string;
  let service: NotebookService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'service-test-'));
    service = new NotebookService();
  });

  afterEach(async () => {
    const provider = await service.getProvider(tmpDir);
    await provider.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles write, query, and summary MCP operations', async () => {
    // 1. Write an agent note
    const ack = await service.write(
      {
        note_type: 'warning',
        content: 'Service integration warning',
        files: ['src/service.ts'],
        domain: 'kernel',
        severity: 'warning',
        track_id: 'track-test',
        invocation_id: `inv-serv-${Date.now()}-${Math.random()}`,
      },
      tmpDir
    );

    expect(ack.id).toBeDefined();
    expect(ack.deduplicated).toBe(false);

    // 2. Query note - should return stripped/unwrapped content
    const queried = await service.query(
      {
        domain: 'kernel',
      },
      tmpDir
    );

    expect(queried.length).toBeGreaterThanOrEqual(1);
    expect(queried[0].content).toBe('Service integration warning');

    // 3. Summary - should unwrap tags and group by type
    const summary = await service.summary({ track_id: 'track-test' }, tmpDir);
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.by_type.warning).toBeDefined();
    expect(summary.by_type.warning![0].content).toBe('Service integration warning');

    // 4. Test already wrapped content does not double-wrap
    const ackWrapped = await service.write(
      {
        note_type: 'spec',
        content: '<notebook_entry>Pre-wrapped note</notebook_entry>',
        files: ['src/spec.ts'],
        domain: 'kernel',
        severity: 'info',
        track_id: 'track-test',
        invocation_id: `inv-serv-wrapped-${Date.now()}`,
      },
      tmpDir
    );
    expect(ackWrapped.id).toBeDefined();

    const queriedWrapped = await service.query({ domain: 'kernel', note_types: ['spec'] }, tmpDir);
    expect(queriedWrapped[0].content).toBe('Pre-wrapped note');
  });

  it('enforces authority and validation errors via NotebookService', async () => {
    // Missing track_id
    await expect(
      service.write(
        {
          note_type: 'warning',
          content: 'Missing track_id',
          files: ['a.ts'],
          domain: 'core',
          severity: 'warning',
          invocation_id: 'inv-err-track-1',
        },
        tmpDir
      )
    ).rejects.toThrow(ValidationError);

    // Empty track_id
    await expect(
      service.write(
        {
          note_type: 'warning',
          content: 'Empty track_id',
          files: ['a.ts'],
          domain: 'core',
          severity: 'warning',
          track_id: '   ',
          invocation_id: 'inv-err-track-2',
        },
        tmpDir
      )
    ).rejects.toThrow(ValidationError);

    // Content length > 280
    await expect(
      service.write(
        {
          note_type: 'warning',
          content: 'a'.repeat(281),
          files: ['a.ts'],
          domain: 'core',
          severity: 'warning',
          track_id: 'track-test',
          invocation_id: 'inv-err-1',
        },
        tmpDir
      )
    ).rejects.toThrow(ValidationError);

    // Quorum note without token
    await expect(
      service.write(
        {
          note_type: 'quorum',
          content: 'Quorum check',
          files: ['a.ts'],
          domain: 'core',
          severity: 'info',
          track_id: 'track-test',
          invocation_id: 'inv-err-2',
        },
        tmpDir
      )
    ).rejects.toThrow(UnauthorizedNoteError);
  });
});
