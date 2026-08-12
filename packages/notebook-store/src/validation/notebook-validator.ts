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
}

export class NotebookValidator {
  private static get cacheFilePath(): string {
    const dir = path.join(os.homedir(), '.superconductor');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'notebook-ratelimits.json');
  }

  private static loadCounts(): Record<string, number> {
    try {
      if (fs.existsSync(NotebookValidator.cacheFilePath)) {
        return JSON.parse(fs.readFileSync(NotebookValidator.cacheFilePath, 'utf-8'));
      }
    } catch(e) {
      console.error('Failed to load rate limits:', e);
    }
    return {};
  }

  private static saveCounts(counts: Record<string, number>) {
    try {
      fs.writeFileSync(NotebookValidator.cacheFilePath, JSON.stringify(counts), 'utf-8');
    } catch(e) {
      console.error('Failed to save rate limits:', e);
    }
  }

  public static resetRateLimits(): void {
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
    if (typeof entry.content !== 'string' || entry.content.length > 280) {
      throw new ValidationError(
        `Note content length (${entry.content?.length ?? 0}) exceeds maximum of 280 characters`
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
    const authority = NOTE_AUTHORITY[entry.note_type];
    if (authority === 'agent' && options?.invocation_id) {
      const counts = NotebookValidator.loadCounts();
      const count = counts[options.invocation_id] || 0;
      
      if (count >= 3) {
        throw new RateLimitError(
          `Invocation '${options.invocation_id}' has reached maximum rate limit of 3 agent-authority notes`
        );
      }
      
      counts[options.invocation_id] = count + 1;
      NotebookValidator.saveCounts(counts);
    }
  }
}
