import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolves the root directory of the current project.
 *
 * It attempts to find the Git repository root using `git rev-parse --show-toplevel`
 * executed from `fromDir` (or `process.cwd()` if omitted).
 * The resulting path is canonicalized using `fs.realpathSync`.
 *
 * If the git command fails (e.g. not in a git repository, git not installed, or process error),
 * it safely falls back to `path.resolve(fromDir ?? process.cwd())`, also normalized via `fs.realpathSync` if possible.
 *
 * This function guarantees it will never throw an unhandled exception.
 *
 * @param fromDir - Optional directory to resolve from. Defaults to `process.cwd()`.
 * @returns Absolute, realpathSync-normalized path to the project root.
 */
export function resolveProjectRoot(fromDir?: string): string {
  try {
    let startDir: string;
    try {
      startDir = path.resolve(fromDir ?? process.cwd());
    } catch {
      startDir = fromDir ? path.resolve(fromDir) : '/';
    }

    try {
      const rawGitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: startDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (rawGitRoot) {
        try {
          return fs.realpathSync(rawGitRoot);
        } catch {
          return path.resolve(rawGitRoot);
        }
      }
    } catch {
      // Git command failed (not a git repo, git not found, etc.)
    }

    try {
      return fs.realpathSync(startDir);
    } catch {
      return startDir;
    }
  } catch {
    return fromDir ? path.resolve(fromDir) : (typeof process !== 'undefined' && process.cwd ? process.cwd() : '.');
  }
}
