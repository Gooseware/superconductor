import { describe, it, expect, vi } from 'vitest';
import { DependencyAnalyzer } from '../../src/intelligence/dependency-analyzer';
import * as swc from '@swc/core';

describe('DependencyAnalyzer', () => {
  it('should parse explicit imports from a file using swc', async () => {
    const analyzer = new DependencyAnalyzer();
    const sourceCode = `
      import { foo } from './foo';
      import bar from '../bar';
      import * as baz from 'baz-pkg';
      
      console.log(foo, bar, baz);
    `;
    
    // We mock fs or we provide the source code directly.
    // Let's assume analyzer has a method parseImports(sourceCode) or we mock a file read.
    // Given the description, it's better to test parsing logic directly if we can.
    const imports = analyzer.parseImports(sourceCode);
    
    expect(imports).toContain('./foo');
    expect(imports).toContain('../bar');
    expect(imports).toContain('baz-pkg');
    expect(imports).toHaveLength(3);
  });

  it('should only parse and map files lazily when explicitly requested', async () => {
    const analyzer = new DependencyAnalyzer();
    
    // We'll mock the file system so we can track file reads
    const mockReadFile = vi.fn().mockImplementation((filePath: string) => {
      if (filePath === 'main.ts') {
        return `import { a } from 'a.ts';`;
      }
      if (filePath === 'a.ts') {
        return `export const a = 1;`;
      }
      return '';
    });
    
    analyzer.setFileReader(mockReadFile);
    
    // Request dependencies for main.ts
    const deps = analyzer.getDependenciesFor('main.ts');
    
    expect(deps).toContain('a.ts');
    // It should have read 'main.ts'
    expect(mockReadFile).toHaveBeenCalledWith('main.ts');
    // It should NOT have eagerly evaluated 'a.ts'
    expect(mockReadFile).not.toHaveBeenCalledWith('a.ts');
  });
  it('should parse imports from a tsx file successfully', async () => {
    const analyzer = new DependencyAnalyzer();
    const sourceCode = `
      import React from 'react';
      import { Button } from './components/Button';
      
      export const App = () => <Button />;
    `;
    const imports = analyzer.parseImports(sourceCode);
    expect(imports).toContain('react');
    expect(imports).toContain('./components/Button');
  });

  it('should parse dynamic imports and re-exports', async () => {
    const analyzer = new DependencyAnalyzer();
    const sourceCode = `
      export * from './all-reexport';
      export { named } from './named-reexport';
      
      const a = import('./dynamic-import');
    `;
    const imports = analyzer.parseImports(sourceCode);
    expect(imports).toContain('./all-reexport');
    expect(imports).toContain('./named-reexport');
    expect(imports).toContain('./dynamic-import');
  });

  it('should support top-level await', async () => {
    const analyzer = new DependencyAnalyzer();
    const sourceCode = `
      import { init } from './init';
      await init();
    `;
    const imports = analyzer.parseImports(sourceCode);
    expect(imports).toContain('./init');
  });

  it('should generate a usage heatmap for multiple files', async () => {
    const analyzer = new DependencyAnalyzer();
    
    // Mock the file system
    const mockReadFile = vi.fn().mockImplementation((filePath: string) => {
      if (filePath === 'src/a.ts') {
        return `import { b } from "./b";`;
      }
      if (filePath === 'src/c.ts') {
        return `import { b } from "./b";\nimport { d } from "./d";`;
      }
      return '';
    });
    
    analyzer.setFileReader(mockReadFile);
    
    // Pass in the list of files to analyze
    const files = ['src/a.ts', 'src/c.ts'];
    const heatmap = analyzer.generateUsageHeatmap(files);
    
    // "src/a.ts" imports "./b" -> resolves to "src/b.ts" (or we expect the analyzer to do basic resolution)
    expect(heatmap['src/b.ts']).toBe(2);
    expect(heatmap['src/d.ts']).toBe(1);
  });
});
