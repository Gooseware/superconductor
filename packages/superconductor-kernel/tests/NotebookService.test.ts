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
        invocation_id: `inv-serv-${Date.now()}-${Math.random()}`,
      },
      tmpDir
    );

    expect(ack.id).toBeDefined();
    expect(ack.deduplicated).toBe(false);

    // 2. Query note
    const queried = await service.query(
      {
        domain: 'kernel',
      },
      tmpDir
    );

    expect(queried.length).toBeGreaterThanOrEqual(1);
    expect(queried[0].content).toBe('Service integration warning');

    // 3. Summary
    const summary = await service.summary({}, tmpDir);
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.by_type.warning).toBeDefined();
  });

  it('enforces authority and validation errors via NotebookService', async () => {
    // Content length > 280
    await expect(
      service.write(
        {
          note_type: 'warning',
          content: 'a'.repeat(281),
          files: ['a.ts'],
          domain: 'core',
          severity: 'warning',
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
          invocation_id: 'inv-err-2',
        },
        tmpDir
      )
    ).rejects.toThrow(UnauthorizedNoteError);
  });
});
