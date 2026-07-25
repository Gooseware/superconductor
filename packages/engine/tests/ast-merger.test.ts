import { describe, it, expect } from 'vitest';
import { mergeFiles, MergeConflictError } from '../src/concurrency/ast-merger';

describe('AST Merger', () => {
  it('merges non-overlapping functions', () => {
    const sourceA = `function foo() { return 1; }`;
    const sourceB = `function bar() { return 2; }`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('function foo() { return 1; }');
    expect(result).toContain('function bar() { return 2; }');
  });

  it('merges non-overlapping class methods', () => {
    const sourceA = `class MyClass {
  foo() { return 1; }
}`;
    const sourceB = `class MyClass {
  bar() { return 2; }
}`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('foo() { return 1; }');
    expect(result).toContain('bar() { return 2; }');
  });

  it('merges non-overlapping interface properties', () => {
    const sourceA = `interface MyInterface {
  foo: string;
}`;
    const sourceB = `interface MyInterface {
  bar: number;
}`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('foo: string;');
    expect(result).toContain('bar: number;');
  });

  it('throws on conflict in same node', () => {
    const sourceA = `function foo() { return 1; }`;
    const sourceB = `function foo() { return 2; }`;
    expect(() => mergeFiles(sourceA, sourceB)).toThrow(MergeConflictError);
  });

  it('throws on conflict in class method', () => {
    const sourceA = `class MyClass { foo() { return 1; } }`;
    const sourceB = `class MyClass { foo() { return 2; } }`;
    expect(() => mergeFiles(sourceA, sourceB)).toThrowError(/Conflict in member: foo/);
  });
  
  it('keeps identical functions', () => {
    const sourceA = `function foo() { return 1; }`;
    const sourceB = `function foo() { return 1; }`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toBe('function foo() { return 1; }\n');
  });
});
