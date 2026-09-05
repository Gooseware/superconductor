import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LibSQLNotebookProvider } from '../src/providers/libsql-notebook-provider.js';
import { NotebookService } from '../../superconductor-kernel/src/services/NotebookService.js';
import { RateLimitError } from '../src/validation/notebook-validator.js';
import { ValidationError } from '../dist/index.js';

describe('Notebook Hardening Integration Tests', () => {
  let tmpDir: string;
  let provider: LibSQLNotebookProvider;
  let service: NotebookService;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'hardening-test-'));
    provider = new LibSQLNotebookProvider(tmpDir);
    await provider.init();
    service = new NotebookService();
    (service as any).providers.set(tmpDir, provider);
  });

  afterEach(async () => {
    await provider.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Suite 1: Deduplication before Rate-Limit Increment (REV-4)', () => {
    it('writing the same note content twice with the same invocation_id: first succeeds (count=1), second returns deduplicated: true without incrementing rate limit', async () => {
      const invId = 'inv-dedup-' + Date.now();
      const note = {
        session_id: 's-dedup-1',
        track_id: 'track-dedup',
        agent_role: 'processor',
        domain: 'core',
        files: ['pkg/index.ts'],
        note_type: 'warning' as const,
        content: 'Deduplicated warning note content',
        severity: 'warning' as const,
      };

      // 1. First write succeeds and counts as 1
      const ack1 = await provider.write(note, { invocation_id: invId });
      expect(ack1.deduplicated).toBe(false);
      expect(ack1.id).toBeDefined();

      // 2. Second write returns deduplicated: true and does not increment rate limit
      const ack2 = await provider.write(note, { invocation_id: invId });
      expect(ack2.deduplicated).toBe(true);
      expect(ack2.id).toBe(ack1.id);

      // Verify rate_limits table count is exactly 1
      const countRes = await (provider as any).client.execute({
        sql: 'SELECT count FROM rate_limits WHERE invocation_id = ?',
        args: [invId],
      });
      const countAfterDedup = Number(countRes.rows[0]?.count ?? countRes.rows[0]?.[0]);
      expect(countAfterDedup).toBe(1);

      // 3. Retry writes do NOT prematurely exhaust the 3-note quota
      for (let i = 0; i < 5; i++) {
        const retryAck = await provider.write(note, { invocation_id: invId });
        expect(retryAck.deduplicated).toBe(true);
        expect(retryAck.id).toBe(ack1.id);
      }

      // Count is still 1
      const countResAfterRetries = await (provider as any).client.execute({
        sql: 'SELECT count FROM rate_limits WHERE invocation_id = ?',
        args: [invId],
      });
      expect(Number(countResAfterRetries.rows[0]?.count ?? countResAfterRetries.rows[0]?.[0])).toBe(1);

      // Write 2nd unique note (quota count -> 2)
      const ack3 = await provider.write(
        { ...note, content: 'Unique second note' },
        { invocation_id: invId }
      );
      expect(ack3.deduplicated).toBe(false);

      // Write 3rd unique note (quota count -> 3)
      const ack4 = await provider.write(
        { ...note, content: 'Unique third note' },
        { invocation_id: invId }
      );
      expect(ack4.deduplicated).toBe(false);

      // Quota of 3 is exhausted: 4th unique note fails with RateLimitError
      await expect(
        provider.write(
          { ...note, content: 'Unique fourth note' },
          { invocation_id: invId }
        )
      ).rejects.toThrow(RateLimitError);

      // But retry of existing note still returns deduplicated: true and does not throw
      const retryAckPostExhaustion = await provider.write(note, { invocation_id: invId });
      expect(retryAckPostExhaustion.deduplicated).toBe(true);
      expect(retryAckPostExhaustion.id).toBe(ack1.id);
    });
  });

  describe('Suite 2: Concurrent Writes & Atomic SQLite Rate-Limiting (REV-3)', () => {
    it('prevents race conditions and enforces 3-note cap across 4 concurrent writes with same invocation_id', async () => {
      const invId = 'inv-concurrent-' + Date.now();
      const notes = [1, 2, 3, 4].map((i) => ({
        session_id: 's-concurrent',
        track_id: 'track-concurrent',
        agent_role: 'processor',
        domain: 'core',
        files: [`concurrent-${i}.ts`],
        note_type: 'warning' as const,
        content: `Concurrent unique note content #${i} - ${Date.now()}`,
        severity: 'warning' as const,
      }));

      // Execute 4 concurrent write attempts with the same invocation_id
      const results = await Promise.allSettled(
        notes.map((n) => provider.write(n, { invocation_id: invId }))
      );

      const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

      // Exactly 3 succeed, the 4th fails with RateLimitError
      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(RateLimitError);
      expect(rejected[0].reason.message).toContain('reached maximum rate limit of 3 agent-authority notes');

      // Verify the 3 succeeded have valid IDs and are not deduplicated
      for (const f of fulfilled) {
        expect(f.value.id).toBeDefined();
        expect(f.value.deduplicated).toBe(false);
      }

      // Verify rate_limits table count in SQLite is 4 (the 4th write incremented to 4 and threw)
      const countRes = await (provider as any).client.execute({
        sql: 'SELECT count FROM rate_limits WHERE invocation_id = ?',
        args: [invId],
      });
      expect(Number(countRes.rows[0]?.count ?? countRes.rows[0]?.[0])).toBe(4);

      // Verify exactly 3 notes were actually persisted in the database
      const rowsRes = await (provider as any).client.execute({
        sql: 'SELECT COUNT(*) as count FROM notebook_fts WHERE track_id = ?',
        args: ['track-concurrent'],
      });
      expect(Number(rowsRes.rows[0]?.count ?? rowsRes.rows[0]?.[0])).toBe(3);
    });
  });

  describe('Suite 3: Mandatory track_id Validation (REV-5)', () => {
    it('throws ValidationError when track_id is omitted or empty in NotebookService.write', async () => {
      // 1. Omitted track_id
      await expect(
        service.write(
          {
            note_type: 'warning',
            content: 'Content missing track_id',
            files: ['file.ts'],
            domain: 'kernel',
            severity: 'warning',
            invocation_id: 'inv-val-omitted',
          } as any,
          tmpDir
        )
      ).rejects.toThrow(ValidationError);

      // 2. Empty track_id string
      await expect(
        service.write(
          {
            track_id: '',
            note_type: 'warning',
            content: 'Content with empty track_id',
            files: ['file.ts'],
            domain: 'kernel',
            severity: 'warning',
            invocation_id: 'inv-val-empty',
          },
          tmpDir
        )
      ).rejects.toThrow(ValidationError);

      // 3. Whitespace-only track_id
      await expect(
        service.write(
          {
            track_id: '   \t  \n  ',
            note_type: 'warning',
            content: 'Content with whitespace-only track_id',
            files: ['file.ts'],
            domain: 'kernel',
            severity: 'warning',
            invocation_id: 'inv-val-whitespace',
          },
          tmpDir
        )
      ).rejects.toThrow(ValidationError);

      // 4. Valid track_id succeeds
      const ack = await service.write(
        {
          track_id: 'valid-track-id',
          note_type: 'warning',
          content: 'Content with valid track_id',
          files: ['file.ts'],
          domain: 'kernel',
          severity: 'warning',
          invocation_id: 'inv-val-valid',
        },
        tmpDir
      );
      expect(ack.id).toBeDefined();
      expect(ack.deduplicated).toBe(false);
    });
  });

  describe('Suite 4: notebook_summary Limit Parameter (REV-2)', () => {
    it('respects limit parameter and caps appropriately for 25 unique notes', async () => {
      const trackId = 'track-summary-limit-test';

      // Insert 25 unique notes for the track
      for (let i = 1; i <= 25; i++) {
        await provider.write(
          {
            session_id: `s-summary-${i}`,
            track_id: trackId,
            agent_role: 'processor',
            domain: 'core',
            files: [`file-${i}.ts`],
            note_type: 'warning',
            content: `Summary limit test note #${i} - ${Date.now()}`,
            severity: 'warning',
          },
          { invocation_id: `inv-summary-${i}` }
        );
      }

      // Verify provider.summary(track_id, 10) respects the limit parameter
      const summary10 = await provider.summary(trackId, 10);
      expect(summary10.total).toBe(10);
      const totalNotes10 = Object.values(summary10.by_type).reduce(
        (acc, notes) => acc + (notes?.length ?? 0),
        0
      );
      expect(totalNotes10).toBe(10);

      // Verify NotebookService.summary({ track_id, limit: 10 }) respects the limit parameter
      const serviceSummary10 = await service.summary({ track_id: trackId, limit: 10 }, tmpDir);
      expect(serviceSummary10.total).toBe(10);
      const serviceTotalNotes10 = Object.values(serviceSummary10.by_type).reduce(
        (acc, notes) => acc + (notes?.length ?? 0),
        0
      );
      expect(serviceTotalNotes10).toBe(10);

      // Verify default limit caps appropriately (default: 20 notes)
      const summaryDefault = await provider.summary(trackId);
      expect(summaryDefault.total).toBe(20);
      const totalNotesDefault = Object.values(summaryDefault.by_type).reduce(
        (acc, notes) => acc + (notes?.length ?? 0),
        0
      );
      expect(totalNotesDefault).toBe(20);

      const serviceSummaryDefault = await service.summary({ track_id: trackId }, tmpDir);
      expect(serviceSummaryDefault.total).toBe(20);
      const serviceTotalNotesDefault = Object.values(serviceSummaryDefault.by_type).reduce(
        (acc, notes) => acc + (notes?.length ?? 0),
        0
      );
      expect(serviceTotalNotesDefault).toBe(20);

      // Verify higher limit returns all 25 notes
      const summaryAll = await provider.summary(trackId, 50);
      expect(summaryAll.total).toBe(25);
    });
  });
});
