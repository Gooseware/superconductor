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
    const ast = swc.parseSync(sourceCode, {
      syntax: 'typescript',
      tsx: true,
      target: 'es2022',
      comments: false,
    });

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

  public getDependenciesFor(filePath: string): string[] {
    const sourceCode = this.fileReader(filePath) as string;
    return this.parseImports(sourceCode);
  }

  public resolveImportPath(importPath: string, currentFile: string): string | null {
    if (!importPath.startsWith('.')) {
      return null; // External package
    }
    
    let joined = path.posix.join(path.posix.dirname(currentFile), importPath);
    
    // Simplistic extension resolution for TS/JS
    if (!joined.endsWith('.ts') && !joined.endsWith('.tsx') && !joined.endsWith('.js') && !joined.endsWith('.jsx')) {
      joined += '.ts';
    }
    return joined;
  }

  public generateUsageHeatmap(files: string[]): Record<string, number> {
    const heatmap: Record<string, number> = {};
    for (const file of files) {
      const deps = this.getDependenciesFor(file);
      for (const dep of deps) {
        const resolved = this.resolveImportPath(dep, file);
        if (resolved) {
          heatmap[resolved] = (heatmap[resolved] || 0) + 1;
        }
      }
    }
    return heatmap;
  }
}
