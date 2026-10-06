import * as child_process from 'node:child_process';
import * as path from 'node:path';

export interface DiffLine {
  lineNumber: number;
  content: string;
}

export interface DiffHunkLine {
  type: 'add' | 'remove' | 'context';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  heading?: string;
  addedLines: DiffLine[];
  removedLines: DiffLine[];
  lines: DiffHunkLine[];
}

export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileDiff {
  oldPath: string | null;
  newPath: string | null;
  type: DiffFileStatus;
  status: DiffFileStatus;
  path: string;
  hunks: DiffHunk[];
  addedLines: Array<{ line: number; content: string; hunkHeading?: string }>;
  removedLines: Array<{ line: number; content: string; hunkHeading?: string }>;
  changedFunctions: string[];
}

export interface ParsedDiffFile extends FileDiff {}

export interface ParsedGitDiff {
  files: FileDiff[];
  rawDiff: string;
}

export interface TargetFilesCheckResult {
  isWithin: boolean;
  unexpectedFiles: string[];
  expectedFiles: string[];
  actualFiles: string[];
}

export interface CommitRangeOptions {
  cwd?: string;
  execFn?: (cmd: string, options?: child_process.ExecSyncOptions) => string | Buffer;
}

/**
 * GitDiffInspector parses unified git diffs into structured file diffs,
 * hunks, added/removed lines, and syntax mutations.
 */
export class GitDiffInspector {
  private fileDiffs: FileDiff[];
  private rawDiff: string;

  constructor(rawDiff: string = '') {
    this.rawDiff = rawDiff;
    this.fileDiffs = GitDiffInspector.parse(rawDiff);
  }

  public getParsed(): FileDiff[] {
    return this.fileDiffs;
  }

  public getModifiedFiles(): string[] {
    return this.fileDiffs.map((f) => f.path).filter((p) => Boolean(p));
  }

  public getFile(filePath: string): FileDiff | undefined {
    const normalized = GitDiffInspector.normalizePath(filePath);
    return this.fileDiffs.find((f) => {
      const fNorm = GitDiffInspector.normalizePath(f.path);
      return fNorm === normalized || fNorm.endsWith(`/${normalized}`) || normalized.endsWith(`/${fNorm}`);
    });
  }

  public getAddedLines(filePath?: string): Array<{ file: string; line: number; content: string; hunkHeading?: string }> {
    if (filePath) {
      const file = this.getFile(filePath);
      if (!file) return [];
      return file.addedLines.map((al) => ({
        file: file.path,
        line: al.line,
        content: al.content,
        hunkHeading: al.hunkHeading,
      }));
    }

    const results: Array<{ file: string; line: number; content: string; hunkHeading?: string }> = [];
    for (const file of this.fileDiffs) {
      for (const al of file.addedLines) {
        results.push({
          file: file.path,
          line: al.line,
          content: al.content,
          hunkHeading: al.hunkHeading,
        });
      }
    }
    return results;
  }

  public getRemovedLines(filePath?: string): Array<{ file: string; line: number; content: string; hunkHeading?: string }> {
    if (filePath) {
      const file = this.getFile(filePath);
      if (!file) return [];
      return file.removedLines.map((rl) => ({
        file: file.path,
        line: rl.line,
        content: rl.content,
        hunkHeading: rl.hunkHeading,
      }));
    }

    const results: Array<{ file: string; line: number; content: string; hunkHeading?: string }> = [];
    for (const file of this.fileDiffs) {
      for (const rl of file.removedLines) {
        results.push({
          file: file.path,
          line: rl.line,
          content: rl.content,
          hunkHeading: rl.hunkHeading,
        });
      }
    }
    return results;
  }

  public getChangedFunctions(filePath?: string): string[] {
    if (filePath) {
      const file = this.getFile(filePath);
      return file ? [...file.changedFunctions] : [];
    }
    const all = new Set<string>();
    for (const file of this.fileDiffs) {
      for (const fn of file.changedFunctions) {
        all.add(fn);
      }
    }
    return Array.from(all);
  }

  public isWithinTargetFiles(expectedTargetFiles: string[] | Set<string>): TargetFilesCheckResult {
    return GitDiffInspector.isWithinTargetFiles(this.fileDiffs, expectedTargetFiles);
  }

  public hasChanges(): boolean {
    return this.fileDiffs.length > 0;
  }

  public static isWithinTargetFiles(
    fileDiffsOrInspector: FileDiff[] | GitDiffInspector,
    expectedTargetFiles: string[] | Set<string>
  ): TargetFilesCheckResult {
    const fileDiffs = fileDiffsOrInspector instanceof GitDiffInspector
      ? fileDiffsOrInspector.getParsed()
      : fileDiffsOrInspector;

    const expectedList = Array.from(expectedTargetFiles);
    const normalizedExpected = expectedList.map((p) => GitDiffInspector.normalizePath(p));
    const actualFiles = fileDiffs.map((f) => f.path).filter((p) => Boolean(p));
    const unexpectedFiles: string[] = [];

    for (const file of actualFiles) {
      const normFile = GitDiffInspector.normalizePath(file);
      const isExpected = normalizedExpected.some((expected) => {
        return normFile === expected || normFile.endsWith(`/${expected}`) || expected.endsWith(`/${normFile}`);
      });

      if (!isExpected) {
        unexpectedFiles.push(file);
      }
    }

    return {
      isWithin: unexpectedFiles.length === 0,
      unexpectedFiles,
      expectedFiles: expectedList,
      actualFiles,
    };
  }

  public static normalizePath(p: string): string {
    if (!p) return '';
    let normalized = p.replace(/\\/g, '/').trim();
    if (normalized.startsWith('a/') || normalized.startsWith('b/')) {
      normalized = normalized.slice(2);
    }
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    return path.normalize(normalized).replace(/\\/g, '/');
  }

  public static fromCommitRange(range: string = 'HEAD~1..HEAD', options?: CommitRangeOptions): GitDiffInspector {
    const exec = options?.execFn || child_process.execSync;
    const cwd = options?.cwd || process.cwd();

    try {
      const rawOutput = exec(`git diff ${range}`, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      });
      const diffString = typeof rawOutput === 'string' ? rawOutput : rawOutput.toString('utf8');
      return new GitDiffInspector(diffString);
    } catch {
      return new GitDiffInspector('');
    }
  }

  public static parse(diffText: string): FileDiff[] {
    if (!diffText || !diffText.trim()) {
      return [];
    }

    const lines = diffText.split(/\r?\n/);
    const fileDiffs: FileDiff[] = [];
    let currentFileDiff: FileDiff | null = null;
    let currentHunk: DiffHunk | null = null;
    let currentOldLine = 0;
    let currentNewLine = 0;

    const finalizeHunk = () => {
      if (currentFileDiff && currentHunk) {
        currentFileDiff.hunks.push(currentHunk);
        currentHunk = null;
      }
    };

    const finalizeFile = () => {
      finalizeHunk();
      if (currentFileDiff) {
        // Compute canonical path
        currentFileDiff.path = currentFileDiff.newPath || currentFileDiff.oldPath || '';

        // Collect changed functions
        const funcs = new Set<string>();
        for (const hunk of currentFileDiff.hunks) {
          if (hunk.heading) {
            const extracted = GitDiffInspector.extractFunctionFromHeadingOrLine(hunk.heading);
            if (extracted) funcs.add(extracted);
          }
          for (const line of hunk.lines) {
            if (line.type === 'add' || line.type === 'remove') {
              const extracted = GitDiffInspector.extractFunctionFromHeadingOrLine(line.content);
              if (extracted) funcs.add(extracted);
            }
          }
        }
        currentFileDiff.changedFunctions = Array.from(funcs);
        fileDiffs.push(currentFileDiff);
        currentFileDiff = null;
      }
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // File header: "diff --git a/... b/..."
      if (line.startsWith('diff --git ')) {
        finalizeFile();

        const match = line.match(/^diff --git\s+(?:a\/)?([^\s]+)\s+(?:b\/)?([^\s]+)/);
        let oldPath = match ? match[1] : null;
        let newPath = match ? match[2] : null;
        if (oldPath && oldPath.startsWith('"') && oldPath.endsWith('"')) oldPath = oldPath.slice(1, -1);
        if (newPath && newPath.startsWith('"') && newPath.endsWith('"')) newPath = newPath.slice(1, -1);

        const normOld = oldPath ? GitDiffInspector.normalizePath(oldPath) : null;
        const normNew = newPath ? GitDiffInspector.normalizePath(newPath) : null;

        currentFileDiff = {
          oldPath: normOld,
          newPath: normNew,
          type: 'modified',
          status: 'modified',
          path: normNew || normOld || '',
          hunks: [],
          addedLines: [],
          removedLines: [],
          changedFunctions: [],
        };
        i++;
        continue;
      }

      // Standalone header: --- a/... +++ b/...
      const standaloneOld = line.match(/^---\s+(?:a\/)?([^\s\t]+)/);
      if (standaloneOld && !currentFileDiff) {
        finalizeFile();
        let oldPath = standaloneOld[1];
        let newPath = '';
        if (i + 1 < lines.length) {
          const standaloneNew = lines[i + 1].match(/^\+\+\+\s+(?:b\/)?([^\s\t]+)/);
          if (standaloneNew) {
            newPath = standaloneNew[1];
            i++;
          }
        }

        const normOld = oldPath === '/dev/null' ? null : GitDiffInspector.normalizePath(oldPath);
        const normNew = newPath === '/dev/null' ? null : GitDiffInspector.normalizePath(newPath);

        let type: DiffFileStatus = 'modified';
        if (normOld === null) type = 'added';
        else if (normNew === null) type = 'deleted';

        currentFileDiff = {
          oldPath: normOld,
          newPath: normNew,
          type,
          status: type,
          path: normNew || normOld || '',
          hunks: [],
          addedLines: [],
          removedLines: [],
          changedFunctions: [],
        };
        i++;
        continue;
      }

      if (currentFileDiff) {
        if (line.startsWith('new file mode')) {
          currentFileDiff.type = 'added';
          currentFileDiff.status = 'added';
          i++;
          continue;
        }
        if (line.startsWith('deleted file mode')) {
          currentFileDiff.type = 'deleted';
          currentFileDiff.status = 'deleted';
          i++;
          continue;
        }
        if (line.startsWith('similarity index') || line.startsWith('rename from') || line.startsWith('rename to')) {
          currentFileDiff.type = 'renamed';
          currentFileDiff.status = 'renamed';
          i++;
          continue;
        }

        // "--- a/..." or "--- /dev/null"
        if (line.startsWith('--- ')) {
          const oldFile = line.slice(4).trim();
          if (oldFile === '/dev/null') {
            currentFileDiff.oldPath = null;
            currentFileDiff.type = 'added';
            currentFileDiff.status = 'added';
          } else {
            currentFileDiff.oldPath = GitDiffInspector.normalizePath(oldFile);
          }
          i++;
          continue;
        }

        // "+++ b/..." or "+++ /dev/null"
        if (line.startsWith('+++ ')) {
          const newFile = line.slice(4).trim();
          if (newFile === '/dev/null') {
            currentFileDiff.newPath = null;
            currentFileDiff.type = 'deleted';
            currentFileDiff.status = 'deleted';
            currentFileDiff.path = currentFileDiff.oldPath || '';
          } else {
            currentFileDiff.newPath = GitDiffInspector.normalizePath(newFile);
            currentFileDiff.path = currentFileDiff.newPath;
            if (currentFileDiff.oldPath === null) {
              currentFileDiff.type = 'added';
              currentFileDiff.status = 'added';
            }
          }
          i++;
          continue;
        }

        // Hunk header: @@ -oldStart[,oldLines] +newStart[,newLines] @@ heading
        const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
        if (hunkMatch) {
          finalizeHunk();

          const oldStart = parseInt(hunkMatch[1], 10);
          const oldLines = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
          const newStart = parseInt(hunkMatch[3], 10);
          const newLines = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;
          const heading = (hunkMatch[5] || '').trim();

          currentOldLine = oldStart;
          currentNewLine = newStart;

          currentHunk = {
            oldStart,
            oldLines,
            newStart,
            newLines,
            header: line,
            heading,
            addedLines: [],
            removedLines: [],
            lines: [],
          };
          i++;
          continue;
        }

        if (currentHunk) {
          if (line.startsWith('+')) {
            const content = line.slice(1);
            currentHunk.addedLines.push({
              lineNumber: currentNewLine,
              content,
            });
            currentHunk.lines.push({
              type: 'add',
              newLine: currentNewLine,
              content,
            });
            currentFileDiff.addedLines.push({
              line: currentNewLine,
              content,
              hunkHeading: currentHunk.heading,
            });
            currentNewLine++;
          } else if (line.startsWith('-')) {
            const content = line.slice(1);
            currentHunk.removedLines.push({
              lineNumber: currentOldLine,
              content,
            });
            currentHunk.lines.push({
              type: 'remove',
              oldLine: currentOldLine,
              content,
            });
            currentFileDiff.removedLines.push({
              line: currentOldLine,
              content,
              hunkHeading: currentHunk.heading,
            });
            currentOldLine++;
          } else if (line.startsWith(' ') || line === '') {
            const content = line.startsWith(' ') ? line.slice(1) : line;
            currentHunk.lines.push({
              type: 'context',
              oldLine: currentOldLine,
              newLine: currentNewLine,
              content,
            });
            currentOldLine++;
            currentNewLine++;
          }
        }
      }

      i++;
    }

    finalizeFile();

    return fileDiffs;
  }

  public static extractFunctionFromHeadingOrLine(text: string): string | null {
    if (!text) return null;
    const trimmed = text.trim();

    // function foo(...)
    const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_$]+)/);
    if (fnMatch) return fnMatch[1];

    // const foo = (async)? (...) =>
    const arrowMatch = trimmed.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
    if (arrowMatch) return arrowMatch[1];

    // class Foo / interface Foo
    const classMatch = trimmed.match(/(?:export\s+)?(?:class|interface|type|enum)\s+([a-zA-Z0-9_$]+)/);
    if (classMatch) return classMatch[1];

    // Method: methodName(...) { or async methodName(...) {
    const methodMatch = trimmed.match(/(?:public|private|protected|static|async|\*)*\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^;{]+)?\s*\{/);
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
      return methodMatch[1];
    }

    // Test block: describe('...', ...) or it('...', ...) or test('...', ...)
    const testMatch = trimmed.match(/(?:describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (testMatch) return testMatch[1];

    if (trimmed.length > 0 && trimmed.length < 80 && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      const cleanHeading = trimmed.replace(/[{;]/g, '').trim();
      if (cleanHeading) return cleanHeading;
    }

    return null;
  }
}
