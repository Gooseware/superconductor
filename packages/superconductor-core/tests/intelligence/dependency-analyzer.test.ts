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
    const imports = await analyzer.parseImports(sourceCode);
    
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
    const deps = await analyzer.getDependenciesFor('main.ts');
    
    expect(deps).toContain('a.ts');
    // It should have read 'main.ts'
    expect(mockReadFile).toHaveBeenCalledWith('main.ts');
    // It should NOT have eagerly evaluated 'a.ts'
    expect(mockReadFile).not.toHaveBeenCalledWith('a.ts');
  });
});
