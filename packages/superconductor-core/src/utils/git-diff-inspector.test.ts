import { describe, it, expect } from 'vitest';
import { GitDiffInspector } from './git-diff-inspector.js';

describe('GitDiffInspector', () => {
  it('returns empty array on empty diff string', () => {
    expect(GitDiffInspector.parse('')).toEqual([]);
    expect(GitDiffInspector.parse('   ')).toEqual([]);
  });

  it('parses a single modified file with one hunk', () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index 1234567..89abcdef 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,4 +10,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;
    const result = GitDiffInspector.parse(diff);
    expect(result).toHaveLength(1);
    expect(result[0].newPath).toBe('src/app.ts');
    expect(result[0].oldPath).toBe('src/app.ts');
    expect(result[0].type).toBe('modified');
    expect(result[0].hunks).toHaveLength(1);

    const hunk = result[0].hunks[0];
    expect(hunk.oldStart).toBe(10);
    expect(hunk.newStart).toBe(10);
    expect(hunk.addedLines).toEqual([
      { lineNumber: 11, content: 'const b = 3;' },
      { lineNumber: 12, content: 'const c = 4;' },
    ]);
    expect(hunk.removedLines).toEqual([
      { lineNumber: 11, content: 'const b = 2;' },
    ]);
  });

  it('parses added and deleted files', () => {
    const diff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
--- a/src/old-file.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const dead = true;
-export const gone = true;
`;
    const result = GitDiffInspector.parse(diff);
    expect(result).toHaveLength(2);

    expect(result[0].type).toBe('added');
    expect(result[0].oldPath).toBeNull();
    expect(result[0].newPath).toBe('src/new-file.ts');
    expect(result[0].hunks[0].addedLines).toHaveLength(2);

    expect(result[1].type).toBe('deleted');
    expect(result[1].oldPath).toBe('src/old-file.ts');
    expect(result[1].newPath).toBeNull();
    expect(result[1].hunks[0].removedLines).toHaveLength(2);
  });

  it('supports GitDiffInspector instance methods and file queries', () => {
    const diff = `diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts
index 1234567..89abcdef 100644
--- a/src/auth/jwt.ts
+++ b/src/auth/jwt.ts
@@ -10,3 +10,5 @@ export function verifyToken(token: string) {
   const decoded = jwt.decode(token);
+  if (!decoded) {
+    throw new Error('Invalid');
+  }
   return decoded;
 }
`;
    const inspector = new GitDiffInspector(diff);
    expect(inspector.getModifiedFiles()).toEqual(['src/auth/jwt.ts']);
    expect(inspector.hasChanges()).toBe(true);

    const added = inspector.getAddedLines('src/auth/jwt.ts');
    expect(added.length).toBe(3);
    expect(added[0].line).toBe(11);
    expect(added[0].content).toBe('  if (!decoded) {');

    const funcs = inspector.getChangedFunctions('src/auth/jwt.ts');
    expect(funcs).toContain('verifyToken');

    const scope = inspector.isWithinTargetFiles(['src/auth/jwt.ts']);
    expect(scope.isWithin).toBe(true);

    const badScope = inspector.isWithinTargetFiles(['src/other.ts']);
    expect(badScope.isWithin).toBe(false);
    expect(badScope.unexpectedFiles).toEqual(['src/auth/jwt.ts']);
  });
});

