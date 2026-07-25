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
    expect(result).toContain('foo()');
    expect(result).toContain('bar()');
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

  it('preserves generic type parameters, heritage clauses, and modifiers', () => {
    const sourceA = `export class MyClass<T> extends Base implements InterfaceA { foo() { return 1; } }`;
    const sourceB = `export class MyClass<T> extends Base implements InterfaceA { bar() { return 2; } }`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('export class MyClass<T> extends Base implements InterfaceA');
    expect(result).toContain('foo()');
    expect(result).toContain('bar()');
  });

  it('handles static vs instance members correctly', () => {
    const sourceA = `class MyClass { static foo() { return 1; } }`;
    const sourceB = `class MyClass { foo() { return 2; } }`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('static foo()');
    expect(result).toContain('foo() { return 2; }');
  });

  it('handles overloaded functions and methods correctly', () => {
    const sourceA = `
      function foo(a: string): void;
      function foo(a: any) {}
      class MyClass {
        bar(a: string): void;
        bar(a: any) {}
      }
    `;
    const sourceB = `
      function foo(a: string): void;
      function foo(a: any) {}
      class MyClass {
        bar(a: string): void;
        bar(a: any) {}
        baz() {}
      }
    `;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('function foo(a: string): void;');
    expect(result).toContain('function foo(a: any) { }');
    expect(result).toContain('bar(a: string): void;');
    expect(result).toContain('bar(a: any) {}');
    expect(result).toContain('baz() {}');
  });

  it('detects conflicts in type aliases, enums, modules', () => {
    const sourceA = `type MyType = string; enum MyEnum { A } module MyModule { export const x = 1; }`;
    const sourceB = `type MyType = number; enum MyEnum { B } module MyModule { export const x = 2; }`;
    expect(() => mergeFiles(sourceA, sourceB)).toThrow(MergeConflictError);
  });

  it('detects constructor conflicts', () => {
    const sourceA = `class MyClass { constructor() { this.x = 1; } }`;
    const sourceB = `class MyClass { constructor() { this.x = 2; } }`;
    expect(() => mergeFiles(sourceA, sourceB)).toThrowError(/Conflict in member: constructor/);
  });

  it('handles accessors (getters/setters)', () => {
    const sourceA = `class MyClass { get val() { return 1; } }`;
    const sourceB = `class MyClass { set val(v) { } }`;
    const result = mergeFiles(sourceA, sourceB);
    expect(result).toContain('get val()');
    expect(result).toContain('set val(v)');
  });
});
