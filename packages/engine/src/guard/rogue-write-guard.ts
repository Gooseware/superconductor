import * as path from 'path';

export class RogueWriteAttemptError extends Error {
  readonly attemptedPath: string;
  readonly role: string;

  constructor(attemptedPath: string, role: string) {
    super('[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead.');
    this.name = 'RogueWriteAttemptError';
    this.attemptedPath = attemptedPath;
    this.role = role;
    Object.setPrototypeOf(this, RogueWriteAttemptError.prototype);
  }
}

export interface RogueWriteGuardOptions {
  // Protected path glob patterns. Default: ['packages/*/src/**', 'app/**']
  protectedPatterns?: readonly string[];
}

export const DEFAULT_PROTECTED_PATTERNS: readonly string[] = Object.freeze(['packages/*/src/**', 'app/**']);

export class RogueWriteGuard {
  private readonly patterns: readonly string[];

  constructor(private readonly role: string, options: RogueWriteGuardOptions = {}) {
    this.patterns = options.protectedPatterns ?? DEFAULT_PROTECTED_PATTERNS;
  }

  /**
   * Asserts that a write to the given path is permitted for this role.
   * Root-role agents may NOT write to protected paths.
   * @param filePath - The path to write to (can be relative or absolute)
   * @throws RogueWriteAttemptError if role is 'root' and path matches a protected pattern
   */
  assertWriteAllowed(filePath: string): void {
    if (this.role !== 'root') return;

    // Normalize: strip leading slash, use forward slashes
    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/').replace(/^\//, '');

    const isProtected = this.patterns.some(pattern =>
      path.matchesGlob(normalizedPath, pattern)
    );

    if (isProtected) {
      throw new RogueWriteAttemptError(filePath, this.role);
    }
  }
}
