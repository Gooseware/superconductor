import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NoteWriter,
  writeDesignNote,
  writeWarningNote,
  writePreferenceNote,
  writeQuorumNote,
  writeProcedureNote,
  writeStyleNote,
  writeReusableCodeNote,
  formatNoteContent,
  extractNoteContent,
  setNoteDispatcher,
  NoteEntry,
  NoteWriterOptions,
} from '../note-writer.js';

describe('NoteWriter utility (wu-4)', () => {
  let capturedEntries: NoteEntry[] = [];
  let capturedOptions: NoteWriterOptions[] = [];

  beforeEach(() => {
    capturedEntries = [];
    capturedOptions = [];
    setNoteDispatcher(async (entry, options) => {
      capturedEntries.push(entry);
      capturedOptions.push(options);
      return { id: 'ack-' + entry.id };
    });
  });

  describe('Suite 1: Typed Methods & Tagging', () => {
    const opts: NoteWriterOptions = { track_id: 'track-test-123' };

    it('writeDesignNote produces content wrapped in <notebook_entry> with note_type=design', async () => {
      const res = await writeDesignNote('Design architecture rationale', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('design');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Design architecture rationale</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writeWarningNote produces content wrapped in <notebook_entry> with note_type=warning', async () => {
      const res = await writeWarningNote('Potential memory leak risk', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('warning');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Potential memory leak risk</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writePreferenceNote produces content wrapped in <notebook_entry> with note_type=preference', async () => {
      const res = await writePreferenceNote('User prefers TypeScript strict mode', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('preference');
      expect(capturedEntries[0].content).toBe('<notebook_entry>User prefers TypeScript strict mode</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writeQuorumNote produces content wrapped in <notebook_entry> with note_type=quorum', async () => {
      const res = await writeQuorumNote('Quorum passed for track', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('quorum');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Quorum passed for track</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writeProcedureNote produces content wrapped in <notebook_entry> with note_type=procedure', async () => {
      const res = await writeProcedureNote('Run migrations before deploy', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('procedure');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Run migrations before deploy</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writeStyleNote produces content wrapped in <notebook_entry> with note_type=style', async () => {
      const res = await writeStyleNote('Follow functional style', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('style');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Follow functional style</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('writeReusableCodeNote produces content wrapped in <notebook_entry> with note_type=reusable_code', async () => {
      const res = await writeReusableCodeNote('Extracted string similarity helper', opts);
      expect(res.id).toBeDefined();
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('reusable_code');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Extracted string similarity helper</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });

    it('verifies that pre-tagged content (<notebook_entry>hello</notebook_entry>) does not get duplicate tags', async () => {
      const preTagged = '<notebook_entry>hello</notebook_entry>';
      
      await writeDesignNote(preTagged, opts);
      expect(capturedEntries[0].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writeWarningNote(preTagged, opts);
      expect(capturedEntries[1].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writePreferenceNote(preTagged, opts);
      expect(capturedEntries[2].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writeQuorumNote(preTagged, opts);
      expect(capturedEntries[3].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writeProcedureNote(preTagged, opts);
      expect(capturedEntries[4].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writeStyleNote(preTagged, opts);
      expect(capturedEntries[5].content).toBe('<notebook_entry>hello</notebook_entry>');

      await writeReusableCodeNote(preTagged, opts);
      expect(capturedEntries[6].content).toBe('<notebook_entry>hello</notebook_entry>');

      expect(capturedEntries).toHaveLength(7);
      for (const entry of capturedEntries) {
        expect(entry.content.match(/<notebook_entry>/g)).toHaveLength(1);
        expect(entry.content.match(/<\/notebook_entry>/g)).toHaveLength(1);
      }
    });

    it('works via NoteWriter static and instance class methods', async () => {
      const staticRes = await NoteWriter.writeDesignNote('Design from static', opts);
      expect(staticRes.id).toBeDefined();
      expect(capturedEntries[0].content).toBe('<notebook_entry>Design from static</notebook_entry>');

      const instance = new NoteWriter();
      const instanceRes = await instance.writeStyleNote('Style from instance', opts);
      expect(instanceRes.id).toBeDefined();
      expect(capturedEntries[1].content).toBe('<notebook_entry>Style from instance</notebook_entry>');
    });

    it('supports single object argument with content and options combined', async () => {
      await writeDesignNote({ track_id: 'track-test-123', content: 'Combined arg design' });
      expect(capturedEntries).toHaveLength(1);
      expect(capturedEntries[0].note_type).toBe('design');
      expect(capturedEntries[0].content).toBe('<notebook_entry>Combined arg design</notebook_entry>');
      expect(capturedEntries[0].track_id).toBe('track-test-123');
    });
  });

  describe('Suite 2: Content Length & Truncation', () => {
    const opts: NoteWriterOptions = { track_id: 'track-test-123' };

    it('safely preserves content <= 280 characters without truncation', async () => {
      const exact280 = 'x'.repeat(280);
      await writeDesignNote(exact280, opts);
      expect(capturedEntries).toHaveLength(1);
      const inner = extractNoteContent(capturedEntries[0].content);
      expect(inner.length).toBe(280);
      expect(inner).toBe(exact280);
      expect(capturedEntries[0].content).toBe(`<notebook_entry>${exact280}</notebook_entry>`);
    });

    it('truncates content exceeding 280 characters to exactly 280 characters within tags', async () => {
      const long350 = 'A'.repeat(350);
      await writeDesignNote(long350, opts);
      expect(capturedEntries).toHaveLength(1);
      const inner = extractNoteContent(capturedEntries[0].content);
      expect(inner.length).toBe(280);
      expect(inner).toBe('A'.repeat(280));
      expect(capturedEntries[0].content).toBe(`<notebook_entry>${'A'.repeat(280)}</notebook_entry>`);
    });

    it('truncates 281 characters to 280 characters (boundary condition)', async () => {
      const boundary281 = 'C'.repeat(281);
      await writeWarningNote(boundary281, opts);
      expect(capturedEntries).toHaveLength(1);
      const inner = extractNoteContent(capturedEntries[0].content);
      expect(inner.length).toBe(280);
      expect(inner).toBe('C'.repeat(280));
      expect(capturedEntries[0].content).toBe(`<notebook_entry>${'C'.repeat(280)}</notebook_entry>`);
    });

    it('truncates already-tagged content exceeding 280 characters to <= 280 characters within tags', async () => {
      const longTagged = `<notebook_entry>${'B'.repeat(320)}</notebook_entry>`;
      await writeProcedureNote(longTagged, opts);
      expect(capturedEntries).toHaveLength(1);
      const inner = extractNoteContent(capturedEntries[0].content);
      expect(inner.length).toBe(280);
      expect(inner).toBe('B'.repeat(280));
      expect(capturedEntries[0].content).toBe(`<notebook_entry>${'B'.repeat(280)}</notebook_entry>`);
    });

    it('truncates content exceeding 280 characters when using NoteWriter class methods', async () => {
      const longContent = 'Z'.repeat(300);
      await NoteWriter.writeReusableCodeNote(longContent, opts);
      expect(capturedEntries).toHaveLength(1);
      const inner = extractNoteContent(capturedEntries[0].content);
      expect(inner.length).toBe(280);
      expect(inner).toBe('Z'.repeat(280));
    });
  });

  describe('Suite 3: Mandatory track_id', () => {
    it('throws Error("track_id is required") when track_id is empty string across all 7 methods', async () => {
      await expect(writeDesignNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeWarningNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writePreferenceNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeQuorumNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeProcedureNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeStyleNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeReusableCodeNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
    });

    it('throws Error("track_id is required") when options is missing or has no track_id across all 7 methods', async () => {
      await expect(writeDesignNote('content', {} as any)).rejects.toThrow('track_id is required');
      await expect(writeWarningNote('content', {} as any)).rejects.toThrow('track_id is required');
      await expect(writePreferenceNote('content', {} as any)).rejects.toThrow('track_id is required');
      await expect(writeQuorumNote('content', {} as any)).rejects.toThrow('track_id is required');
      await expect(writeProcedureNote('content', null as any)).rejects.toThrow('track_id is required');
      await expect(writeStyleNote('content', undefined as any)).rejects.toThrow('track_id is required');
      await expect(writeReusableCodeNote('content', {} as any)).rejects.toThrow('track_id is required');
    });

    it('throws Error("track_id is required") when using single object argument without track_id', async () => {
      await expect(writeDesignNote({ content: 'test', track_id: '' })).rejects.toThrow('track_id is required');
      await expect(writeWarningNote({ content: 'test' } as any)).rejects.toThrow('track_id is required');
      await expect(writeQuorumNote({ content: 'test' } as any)).rejects.toThrow('track_id is required');
    });

    it('throws Error("track_id is required") when using NoteWriter class methods without track_id', async () => {
      await expect(NoteWriter.writeDesignNote('content', { track_id: '' })).rejects.toThrow('track_id is required');
      const instance = new NoteWriter();
      await expect(instance.writeQuorumNote('content', {} as any)).rejects.toThrow('track_id is required');
    });
  });

  describe('Suite 4: Error Handling Policy', () => {
    const opts: NoteWriterOptions = { track_id: 'track-test-123' };

    describe('when dispatcher throws an error', () => {
      beforeEach(() => {
        setNoteDispatcher(async () => {
          throw new Error('Database locked / rate limit reached');
        });
      });

      it('surfaces / re-throws errors for quorum notes', async () => {
        await expect(writeQuorumNote('Quorum finding', opts)).rejects.toThrow(
          'Database locked / rate limit reached'
        );
      });

      it('surfaces / re-throws errors for warning notes', async () => {
        await expect(writeWarningNote('Security warning', opts)).rejects.toThrow(
          'Database locked / rate limit reached'
        );
      });

      it('swallows errors and returns { error: ... } for design notes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writeDesignNote('Design pivot', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        expect(res.id).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('swallows errors and returns { error: ... } for preference notes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writePreferenceNote('User preference', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        expect(res.id).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('swallows errors and returns { error: ... } for style notes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writeStyleNote('Code style', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        expect(res.id).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('swallows errors and returns { error: ... } for procedure notes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writeProcedureNote('Procedure step', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        expect(res.id).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('swallows errors and returns { error: ... } for reusable_code notes', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writeReusableCodeNote('Component extracted', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        expect(res.id).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('enforces error policy via NoteWriter class methods', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await expect(NoteWriter.writeQuorumNote('Quorum fail', opts)).rejects.toThrow(
          'Database locked / rate limit reached'
        );
        const res = await NoteWriter.writeDesignNote('Design fail', opts);
        expect(res.error).toBe('Database locked / rate limit reached');
        warnSpy.mockRestore();
      });
    });

    describe('when dispatcher returns an error object', () => {
      beforeEach(() => {
        setNoteDispatcher(async () => {
          return { error: 'Rate limit exceeded' };
        });
      });

      it('surfaces error for quorum notes when dispatcher returns { error }', async () => {
        await expect(writeQuorumNote('Quorum note', opts)).rejects.toThrow('Rate limit exceeded');
      });

      it('surfaces error for warning notes when dispatcher returns { error }', async () => {
        await expect(writeWarningNote('Warning note', opts)).rejects.toThrow('Rate limit exceeded');
      });

      it('swallows error and returns { error: ... } for design notes when dispatcher returns { error }', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await writeDesignNote('Design note', opts);
        expect(res.error).toBe('Rate limit exceeded');
        expect(res.id).toBeUndefined();
        warnSpy.mockRestore();
      });
    });
  });
});
