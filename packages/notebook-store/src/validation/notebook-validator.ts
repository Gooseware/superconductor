import { NOTE_AUTHORITY, NotebookEntry } from '../types.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedNoteError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'UnauthorizedNoteError';
  }
}

export class AuthorityError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AuthorityError';
  }
}

export class RateLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'RateLimitError';
  }
}

export interface ValidationOptions {
  user_confirmed?: boolean;
  invocation_id?: string;
  skipRateLimit?: boolean;
  skip_rate_limit?: boolean;
}

export class NotebookValidator {
  /**
   * @deprecated File-based rate limiting is deprecated in favor of atomic SQLite provider rate limiting.
   */
  private static get cacheFilePath(): string {
    const dir = path.join(os.homedir(), '.superconductor');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'notebook-ratelimits.json');
  }

  /**
   * @deprecated File-based rate limiting is deprecated in favor of atomic SQLite provider rate limiting.
   */
  private static counts: Map<string, number> = new Map<string, number>();
  private static fallbackCounts: Map<string, number> = new Map<string, number>();

  /**
   * @deprecated File-based rate limiting is deprecated in favor of atomic SQLite provider rate limiting.
   */
  private static loadCounts(): Map<string, number> | null {
    if (NotebookValidator.counts.size > 0) {
      return NotebookValidator.counts;
    }
    if (NotebookValidator.fallbackCounts.size > 0) {
      NotebookValidator.counts = new Map(NotebookValidator.fallbackCounts);
      return NotebookValidator.counts;
    }
    try {
      if (fs.existsSync(NotebookValidator.cacheFilePath)) {
        const data = fs.readFileSync(NotebookValidator.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        NotebookValidator.counts = new Map<string, number>(Object.entries(parsed));
        NotebookValidator.fallbackCounts = new Map(NotebookValidator.counts);
        return NotebookValidator.counts;
      }
    } catch(e) {
      console.error('Failed to load rate limits:', e);
      return NotebookValidator.counts;
    }
    return NotebookValidator.counts;
  }

  /**
   * @deprecated File-based rate limiting is deprecated in favor of atomic SQLite provider rate limiting.
   */
  private static saveCounts(counts: Map<string, number>) {
    NotebookValidator.counts = counts;
    NotebookValidator.fallbackCounts = counts;
    try {
      const tempPath = NotebookValidator.cacheFilePath + `.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
      const obj = Object.fromEntries(counts);
      fs.writeFileSync(tempPath, JSON.stringify(obj), 'utf-8');
      fs.renameSync(tempPath, NotebookValidator.cacheFilePath);
    } catch(e) {
      console.error('Failed to save rate limits:', e);
    }
  }

  /**
   * @deprecated File-based rate limiting is deprecated in favor of atomic SQLite provider rate limiting.
   */
  public static resetRateLimits(): void {
    NotebookValidator.counts.clear();
    NotebookValidator.fallbackCounts.clear();
    try {
      if (fs.existsSync(NotebookValidator.cacheFilePath)) {
        fs.unlinkSync(NotebookValidator.cacheFilePath);
      }
    } catch (e) {
      // ignore
    }
  }

  public static validate(
    entry: Omit<NotebookEntry, 'id' | 'timestamp'>,
    options?: ValidationOptions
  ): void {
    // 1. Content length > 280 -> ValidationError
    if (typeof entry.content !== 'string') {
      throw new ValidationError(
        `Note content length (${(entry as any)?.content?.length ?? 0}) exceeds maximum of 280 characters`
      );
    }
    const raw = entry.content.replace(/^<notebook_entry>/i, '').replace(/<\/notebook_entry>$/i, '');
    if (raw.length > 280) {
      throw new ValidationError(
        `Note content length (${raw.length}) exceeds maximum of 280 characters`
      );
    }

    // 2. note_type 'quorum' | 'style' requires reviewer_token -> UnauthorizedNoteError
    if (entry.note_type === 'quorum' || entry.note_type === 'style') {
      if (!entry.reviewer_token || entry.reviewer_token.trim() === '') {
        throw new UnauthorizedNoteError(
          `Note type '${entry.note_type}' requires a valid reviewer_token`
        );
      }
    }

    // 3. note_type 'preference' | 'design' requires user_confirmed flag -> AuthorityError
    if (entry.note_type === 'preference' || entry.note_type === 'design') {
      if (!options?.user_confirmed) {
        throw new AuthorityError(
          `Note type '${entry.note_type}' requires user_confirmed flag`
        );
      }
    }

    // 4. Invocation rate limit: max 3 AGENT-authority writes per invocation_id
    // When skipRateLimit or skip_rate_limit is enabled, rate limiting is handled atomically by the provider.
    if (options?.skipRateLimit || options?.skip_rate_limit) {
      return;
    }

    const authority = NOTE_AUTHORITY[entry.note_type] ?? 'agent';
    if (authority === 'agent') {
      const invId = options?.invocation_id || `anon_${entry.session_id}`;
      const counts = NotebookValidator.loadCounts();
      if (counts === null) {
        throw new Error("Rate limit cache corrupted");
      }
      const count = counts.get(invId) || 0;
      
      if (count >= 3) {
        throw new RateLimitError(
          `Invocation '${invId}' has reached maximum rate limit of 3 agent-authority notes`
        );
      }
      
      counts.set(invId, count + 1);
      NotebookValidator.saveCounts(counts);
    }
  }
}
