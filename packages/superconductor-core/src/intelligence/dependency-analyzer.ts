import * as swc from '@swc/core';
import * as path from 'path';
export class DependencyAnalyzer {
  private fileReader: (filePath: string) => string | Promise<string>;

  constructor() {
    // Default file reader could use fs, but we inject it for tests/laziness
    this.fileReader = (filePath: string) => {
      throw new Error('Default file reader not implemented');
    };
  }

  public setFileReader(reader: (filePath: string) => string | Promise<string>) {
    this.fileReader = reader;
  }

  public parseImports(sourceCode: string): string[] {
    let ast;
    try {
      ast = swc.parseSync(sourceCode, {
        syntax: 'typescript',
        tsx: true,
        target: 'es2022',
        comments: false,
      });
    } catch (e) {
      console.warn('Failed to parse source code:', e);
      return [];
    }

    const imports: string[] = [];

    const walk = (node: any) => {
      if (!node) return;
      if (node.type === 'ImportDeclaration') {
        imports.push(node.source.value);
      } else if (node.type === 'ExportAllDeclaration' && node.source) {
        imports.push(node.source.value);
      } else if (node.type === 'ExportNamedDeclaration' && node.source) {
        imports.push(node.source.value);
      } else if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Import') {
        if (node.arguments && node.arguments.length > 0) {
          const expr = node.arguments[0].expression;
          if (expr && expr.type === 'StringLiteral') {
            imports.push(expr.value);
          }
        }
      }
      for (const key in node) {
        if (typeof node[key] === 'object') {
          walk(node[key]);
        }
      }
    };

    walk(ast);
    return imports;
  }

  public getDependenciesFor(filePath: string): string[] | Promise<string[]> {
    const sourceCode = this.fileReader(filePath);
    if (sourceCode instanceof Promise) {
      return sourceCode
        .then(code => this.parseImports(code))
        .catch(e => {
          console.warn(`Failed to read file ${filePath}:`, e);
          return [];
        });
    }
    return this.parseImports(sourceCode);
  }

  public resolveImportPath(importPath: string, currentFile: string): string | null {
    if (!importPath.startsWith('.')) {
      return null; // External package
    }
    
    // Normalize path separators to avoid posix/win32 issues
    let joined = path.join(path.dirname(currentFile), importPath);
    // Convert to posix style as expected by heatmap downstream
    joined = joined.split(path.sep).join(path.posix.sep);
    
    // Simplistic extension resolution for TS/JS
    if (!joined.endsWith('.ts') && !joined.endsWith('.tsx') && !joined.endsWith('.js') && !joined.endsWith('.jsx')) {
      joined += '.ts';
    }
    return joined;
  }

  public generateUsageHeatmap(files: string[]): Record<string, number> | Promise<Record<string, number>> {
    const heatmap: Record<string, number> = {};
    const promises: Promise<void>[] = [];

    for (const file of files) {
      const depsResult = this.getDependenciesFor(file);
      
      const processDeps = (deps: string[]) => {
        for (const dep of deps) {
          const resolved = this.resolveImportPath(dep, file);
          if (resolved) {
            heatmap[resolved] = (heatmap[resolved] || 0) + 1;
          }
        }
      };

      if (depsResult instanceof Promise) {
        promises.push(depsResult.then(processDeps));
      } else {
        processDeps(depsResult);
      }
    }
    
    if (promises.length > 0) {
      return Promise.all(promises).then(() => heatmap);
    }
    
    return heatmap;
  }
}
