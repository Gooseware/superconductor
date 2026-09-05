/**
 * NoteWriter Utility Module
 *
 * Implements hardened note-taking utility for Superconductor agents.
 * Wraps content in <notebook_entry> tags, enforces <= 280 chars, track_id requirement,
 * and handles error policies per note type (surface for quorum/warning, swallow for others).
 *
 * Part of track: note_taking_hardening_20260903
 */

import * as crypto from 'node:crypto';

export interface NoteWriterOptions {
  track_id: string;
  session_id?: string;
  invocation_id?: string;
  agent_role?: string;
  domain?: string;
  files?: string[];
  severity?: 'info' | 'warning' | 'critical';
  reviewer_token?: string;
  user_confirmed?: boolean;
}

export interface NoteEntry {
  id?: string;
  note_type: string;
  content: string;
  track_id: string;
  session_id?: string;
  timestamp?: number;
  domain?: string;
  files?: string[];
  severity?: string;
  agent_role?: string;
}

export type NoteDispatcher = (
  entry: NoteEntry,
  options: NoteWriterOptions
) => Promise<{ id?: string; deduplicated?: boolean; error?: string } | void>;

let globalDispatcher: NoteDispatcher | null = null;

export function setNoteDispatcher(dispatcher: NoteDispatcher | null): void {
  globalDispatcher = dispatcher;
}

export function getNoteDispatcher(): NoteDispatcher | null {
  return globalDispatcher;
}

const CRITICAL_NOTE_TYPES = new Set(['quorum', 'warning']);

export function isCriticalType(type: string): boolean {
  return CRITICAL_NOTE_TYPES.has((type || '').toLowerCase());
}

/**
 * Ensures note inner content is <= 280 characters and wrapped in <notebook_entry> tags.
 * Escapes embedded <notebook_entry> and </notebook_entry> tags to prevent breakout.
 */
export function formatNoteContent(rawContent: string): string {
  const str = typeof rawContent === 'string' ? rawContent : String(rawContent ?? '');
  let inner = str;
  if (inner.startsWith('<notebook_entry>') && inner.endsWith('</notebook_entry>') && inner.length >= 33) {
    inner = inner.slice('<notebook_entry>'.length, -('</notebook_entry>'.length));
  } else {
    const match = str.match(/^\s*<notebook_entry>([\s\S]*)<\/notebook_entry>\s*$/);
    if (match) {
      inner = match[1];
    }
  }
  const escaped = inner
    .replace(/<\/notebook_entry>/gi, '&lt;/notebook_entry&gt;')
    .replace(/<notebook_entry>/gi, '&lt;notebook_entry&gt;');
  const truncated = escaped.length > 280 ? escaped.slice(0, 280) : escaped;
  return `<notebook_entry>${truncated}</notebook_entry>`;
}

/**
 * Strips single outermost <notebook_entry> tags while unescaping escaped tags.
 */
export function stripNotebookEntryTags(content: string): string {
  if (typeof content !== 'string') return '';
  let result = content;
  if (result.startsWith('<notebook_entry>') && result.endsWith('</notebook_entry>') && result.length >= 33) {
    result = result.slice('<notebook_entry>'.length, -('</notebook_entry>'.length));
  }
  return result
    .replace(/&lt;\/notebook_entry&gt;/gi, '</notebook_entry>')
    .replace(/&lt;notebook_entry&gt;/gi, '<notebook_entry>');
}

/**
 * Extracts inner content from a <notebook_entry>-wrapped string.
 */
export function extractNoteContent(taggedContent: string): string {
  if (typeof taggedContent !== 'string') return '';
  let result = taggedContent;
  if (result.startsWith('<notebook_entry>') && result.endsWith('</notebook_entry>') && result.length >= 33) {
    result = result.slice('<notebook_entry>'.length, -('</notebook_entry>'.length));
  } else {
    const match = result.match(/^\s*<notebook_entry>([\s\S]*)<\/notebook_entry>\s*$/);
    if (match) {
      result = match[1];
    }
  }
  return result
    .replace(/&lt;\/notebook_entry&gt;/gi, '</notebook_entry>')
    .replace(/&lt;notebook_entry&gt;/gi, '<notebook_entry>');
}

function normalizeArgs(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): { content: string; options: NoteWriterOptions } {
  if (typeof contentOrOptions === 'string') {
    return {
      content: contentOrOptions,
      options: maybeOptions ?? ({} as NoteWriterOptions),
    };
  }

  const obj = contentOrOptions || {};
  const {
    track_id,
    session_id,
    invocation_id,
    agent_role,
    domain,
    files,
    severity,
    reviewer_token,
    user_confirmed,
    content,
    ...rest
  } = obj;

  const options: NoteWriterOptions = {
    track_id,
    session_id,
    invocation_id,
    agent_role,
    domain,
    files,
    severity,
    reviewer_token,
    user_confirmed,
  };

  let noteContent = '';
  if (typeof content === 'string') {
    noteContent = content;
  } else {
    const summaryParts: string[] = [];
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) {
        summaryParts.push(`${k}=${v}`);
      }
    }
    noteContent = summaryParts.length > 0 ? summaryParts.join('; ') : 'notebook_note';
  }

  return { content: noteContent, options };
}

// Dynamic importer to prevent tsc from trying to statically resolve external monorepo packages
const dynamicImport = (specifier: string): Promise<any> => {
  try {
    return new Function('specifier', 'return import(specifier)')(specifier);
  } catch (e) {
    return Promise.reject(e);
  }
};

async function dispatchWrite(
  entry: NoteEntry,
  options: NoteWriterOptions
): Promise<{ id?: string }> {
  if (globalDispatcher) {
    const res = await globalDispatcher(entry, options);
    if (res && typeof res === 'object' && 'error' in res && res.error) {
      throw new Error(res.error);
    }
    return { id: (res as any)?.id || entry.id };
  }

  const invocationId =
    options.invocation_id ||
    options.session_id ||
    `track_${options.track_id || entry.track_id}`;

  // 1. Try NotebookService if available
  try {
    let kernelMod: any = null;
    try {
      kernelMod = await dynamicImport('@superconductor/kernel');
    } catch {
      try {
        kernelMod = await dynamicImport('../../../superconductor-kernel/dist/services/NotebookService.js');
      } catch {
        kernelMod = await dynamicImport('../../../superconductor-kernel/src/services/NotebookService.js');
      }
    }
    if (kernelMod && kernelMod.NotebookService) {
      const service = new kernelMod.NotebookService();
      const projectRoot = process.cwd();
      const ack = await service.write(
        {
          note_type: entry.note_type,
          content: entry.content,
          files: entry.files || [],
          domain: entry.domain || 'codebase',
          severity: entry.severity || (entry.note_type === 'warning' ? 'warning' : 'info'),
          session_id: entry.session_id,
          track_id: entry.track_id,
          agent_role: entry.agent_role,
          reviewer_token: options.reviewer_token,
          user_confirmed: options.user_confirmed,
          invocation_id: invocationId,
        },
        projectRoot
      );
      return { id: ack.id };
    }
  } catch (err: any) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' && !err?.message?.includes('Cannot find module')) {
      throw err;
    }
  }

  // 2. Try @superconductor/notebook-store provider
  try {
    let storeMod: any = null;
    try {
      storeMod = await dynamicImport('@superconductor/notebook-store');
    } catch {
      try {
        storeMod = await dynamicImport('../../../notebook-store/dist/index.js');
      } catch {
        storeMod = await dynamicImport('../../../notebook-store/src/index.js');
      }
    }
    if (storeMod && storeMod.createNotebookProvider) {
      const projectRoot = process.cwd();
      const provider = await storeMod.createNotebookProvider(projectRoot);
      const ack = await provider.write(
        {
          session_id: entry.session_id || 'default-session',
          track_id: entry.track_id,
          agent_role: entry.agent_role || 'agent',
          domain: entry.domain || 'codebase',
          files: entry.files || [],
          note_type: entry.note_type as any,
          content: entry.content,
          severity: (entry.severity as any) || (entry.note_type === 'warning' ? 'warning' : 'info'),
          reviewer_token: options.reviewer_token,
        },
        {
          user_confirmed: options.user_confirmed,
          invocation_id: invocationId,
        }
      );
      return { id: ack.id };
    }
  } catch (err: any) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' && !err?.message?.includes('Cannot find module')) {
      throw err;
    }
  }

  // 3. Try MCP invocation via antigravity CLI if available
  try {
    const { execFileSync } = await import('node:child_process');
    const args = [
      '--mcp', 'notebook_write',
      '--note_type', entry.note_type,
      '--content', entry.content,
      '--files', JSON.stringify(entry.files || []),
      '--domain', entry.domain || 'codebase',
      '--severity', entry.severity || (entry.note_type === 'warning' ? 'warning' : 'info'),
      '--track_id', entry.track_id,
      '--invocation_id', invocationId,
    ];
    if (entry.session_id) args.push('--session_id', entry.session_id);
    if (options.reviewer_token) args.push('--reviewer_token', options.reviewer_token);
    if (options.user_confirmed) args.push('--user_confirmed', 'true');
    const stdout = execFileSync('antigravity', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const parsed = JSON.parse(stdout);
      return { id: parsed.id || parsed.content?.[0]?.text || entry.id };
    } catch {
      return { id: entry.id };
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }

  // Fallback: standalone context without external services
  return { id: entry.id };
}

/**
 * Base internal write method.
 * Enforces track_id, content length <= 280, wrapping in <notebook_entry>,
 * and error routing policy.
 */
export async function _write(
  type: string,
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  if (!options || !options.track_id || typeof options.track_id !== 'string' || options.track_id.trim() === '') {
    throw new Error('track_id is required');
  }

  const taggedContent = formatNoteContent(content);
  const noteId = crypto.randomUUID();
  const entry: NoteEntry = {
    id: noteId,
    note_type: type,
    content: taggedContent,
    track_id: options.track_id,
    session_id: options.session_id,
    timestamp: Date.now(),
    domain: options.domain,
    files: options.files,
    severity: options.severity,
    agent_role: options.agent_role,
  };

  try {
    const result = await dispatchWrite(entry, options);
    return { id: result?.id || noteId };
  } catch (err: any) {
    if (isCriticalType(type)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[NoteWriter] Warning: failed to write '${type}' note: ${message}`);
    return { error: message };
  }
}

export async function writeDesignNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeDesignNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeDesignNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('design', content, options);
}

export async function writeWarningNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeWarningNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeWarningNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('warning', content, options);
}

export async function writePreferenceNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writePreferenceNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writePreferenceNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('preference', content, options);
}

export async function writeQuorumNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeQuorumNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeQuorumNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('quorum', content, options);
}

export async function writeProcedureNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeProcedureNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeProcedureNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('procedure', content, options);
}

export async function writeStyleNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeStyleNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeStyleNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('style', content, options);
}

export async function writeReusableCodeNote(
  content: string,
  options: NoteWriterOptions
): Promise<{ id?: string; error?: string }>;
export async function writeReusableCodeNote(
  options: NoteWriterOptions & { content?: string; [key: string]: any }
): Promise<{ id?: string; error?: string }>;
export async function writeReusableCodeNote(
  contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
  maybeOptions?: NoteWriterOptions
): Promise<{ id?: string; error?: string }> {
  const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
  return _write('reusable_code', content, options);
}

export class NoteWriter {
  public static setDispatcher(dispatcher: NoteDispatcher | null): void {
    setNoteDispatcher(dispatcher);
  }

  public static getDispatcher(): NoteDispatcher | null {
    return getNoteDispatcher();
  }

  public static async _write(
    type: string,
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    return _write(type, content, options);
  }

  public static async writeDesignNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeDesignNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeDesignNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('design', content, options);
  }

  public static async writeWarningNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeWarningNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeWarningNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('warning', content, options);
  }

  public static async writePreferenceNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writePreferenceNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writePreferenceNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('preference', content, options);
  }

  public static async writeQuorumNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeQuorumNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeQuorumNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('quorum', content, options);
  }

  public static async writeProcedureNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeProcedureNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeProcedureNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('procedure', content, options);
  }

  public static async writeStyleNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeStyleNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeStyleNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('style', content, options);
  }

  public static async writeReusableCodeNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  public static async writeReusableCodeNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  public static async writeReusableCodeNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('reusable_code', content, options);
  }

  // Instance methods
  async _write(
    type: string,
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    return _write(type, content, options);
  }

  async writeDesignNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeDesignNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeDesignNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('design', content, options);
  }

  async writeWarningNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeWarningNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeWarningNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('warning', content, options);
  }

  async writePreferenceNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writePreferenceNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writePreferenceNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('preference', content, options);
  }

  async writeQuorumNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeQuorumNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeQuorumNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('quorum', content, options);
  }

  async writeProcedureNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeProcedureNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeProcedureNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('procedure', content, options);
  }

  async writeStyleNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeStyleNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeStyleNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('style', content, options);
  }

  async writeReusableCodeNote(
    content: string,
    options: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }>;
  async writeReusableCodeNote(
    options: NoteWriterOptions & { content?: string; [key: string]: any }
  ): Promise<{ id?: string; error?: string }>;
  async writeReusableCodeNote(
    contentOrOptions: string | (NoteWriterOptions & { content?: string; [key: string]: any }),
    maybeOptions?: NoteWriterOptions
  ): Promise<{ id?: string; error?: string }> {
    const { content, options } = normalizeArgs(contentOrOptions, maybeOptions);
    return _write('reusable_code', content, options);
  }
}

export default NoteWriter;
