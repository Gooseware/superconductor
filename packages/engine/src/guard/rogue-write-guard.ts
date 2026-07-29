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
  // Workspace root directory. Default: process.cwd()
  workspaceDir?: string;
}

export const DEFAULT_PROTECTED_PATTERNS: readonly string[] = Object.freeze(['packages/*/src/**', 'app/**']);

export class RogueWriteGuard {
  private readonly patterns: readonly string[];
  private readonly workspaceDir: string;

  constructor(private readonly role: string, options: RogueWriteGuardOptions = {}) {
    this.patterns = options.protectedPatterns ?? DEFAULT_PROTECTED_PATTERNS;
    this.workspaceDir = options.workspaceDir ?? process.cwd();
  }

  /**
   * Asserts that a write to the given path is permitted for this role.
   * Root-role agents may NOT write to protected paths.
   * @param filePath - The path to write to (can be relative or absolute)
   * @throws RogueWriteAttemptError if role is 'root' and path matches a protected pattern
   */
  assertWriteAllowed(filePath: string): void {
    if (this.role !== 'root') return;

    // Resolve path securely against workspace root
    const resolvedPath = path.resolve(this.workspaceDir, filePath);
    const relativePath = path.relative(this.workspaceDir, resolvedPath);

    // If it points outside the workspace, we might want to block it, but for now we just check the patterns
    const normalizedPath = relativePath.replace(/\\/g, '/');

    const isProtected = this.patterns.some(pattern =>
      path.matchesGlob(normalizedPath, pattern)
    );

    if (isProtected) {
      throw new RogueWriteAttemptError(filePath, this.role);
    }
  }
}
