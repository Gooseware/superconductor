import { NOTE_AUTHORITY, NotebookEntry } from '../types.js';

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
  private static invocationCounts = new Map<string, number>();

  public static resetRateLimits(): void {
    NotebookValidator.invocationCounts.clear();
  }

  public static validate(
    entry: Omit<NotebookEntry, 'id' | 'timestamp'>,
    options?: ValidationOptions
  ): void {
    // 1. Content length > 280 -> ValidationError
    if (!entry.content || entry.content.length > 280) {
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
      const count = NotebookValidator.invocationCounts.get(options.invocation_id) || 0;
      if (count >= 3) {
        throw new RateLimitError(
          `Invocation '${options.invocation_id}' has reached maximum rate limit of 3 agent-authority notes`
        );
      }
      NotebookValidator.invocationCounts.set(options.invocation_id, count + 1);
    }
  }
}
