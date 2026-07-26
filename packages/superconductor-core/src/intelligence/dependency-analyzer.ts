import * as fs from 'fs';
import * as swc from '@swc/core';
import * as path from 'path';

export class DependencyAnalyzer {
  private fileReader: (filePath: string) => string | Promise<string>;
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    this.projectRoot = this.projectRoot.split(path.sep).join(path.posix.sep);
    // Default file reader could use fs, but we inject it for tests/laziness
    this.fileReader = (filePath: string) => {
      throw new Error('Default file reader not implemented');
    };
  }

  public setFileReader(reader: (filePath: string) => string | Promise<string>) {
    this.fileReader = reader;
  }

  private checkFileExists(filePath: string, customExists?: (filePath: string) => boolean): boolean {
    if (customExists) {
      return customExists(filePath);
    }
    try {
      if (fs.existsSync(filePath)) {
        return !fs.statSync(filePath).isDirectory();
      }
    } catch {}
    if (this.fileReader) {
      try {
        const content = this.fileReader(filePath);
        if (content instanceof Promise) {
          throw new Error('Async file reader used in sync checkFileExists');
        }
        if (typeof content === 'string' && content.length >= 0) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  private async checkFileExistsAsync(filePath: string, customExists?: (filePath: string) => boolean | Promise<boolean>): Promise<boolean> {
    if (customExists) {
      return await customExists(filePath);
    }
    try {
      if (fs.existsSync(filePath)) {
        return !fs.statSync(filePath).isDirectory();
      }
    } catch {}
    if (this.fileReader) {
      try {
        const content = await this.fileReader(filePath);
        if (typeof content === 'string' && content.length >= 0) {
          return true;
        }
      } catch {}
    }
    return false;
  }

  public getFileContent(filePath: string): string | Promise<string> {
    return this.fileReader(filePath);
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

  public resolveImportPath(
    importPath: string,
    currentFile: string,
    fileExists?: (filePath: string) => boolean
  ): string | null {
    if (!importPath.startsWith('.')) {
      return null; // External package
    }

    let joined = path.join(path.dirname(currentFile), importPath);
    joined = joined.split(path.sep).join(path.posix.sep);
    
    // Boundary check
    const absoluteJoined = path.posix.resolve(this.projectRoot, joined);
    if (!absoluteJoined.startsWith(this.projectRoot)) {
      return null;
    }

    const candidates: string[] = [];

    if (joined.endsWith('.js')) {
      const stem = joined.slice(0, -3);
      candidates.push(stem + '.ts', stem + '.tsx', joined);
    } else if (joined.endsWith('.jsx')) {
      const stem = joined.slice(0, -4);
      candidates.push(stem + '.tsx', stem + '.ts', joined);
    } else if (joined.endsWith('.ts') || joined.endsWith('.tsx')) {
      candidates.push(joined);
    } else {
      candidates.push(
        joined + '.ts',
        joined + '.tsx',
        path.posix.join(joined, 'index.ts'),
        path.posix.join(joined, 'index.tsx'),
        joined + '.js',
        path.posix.join(joined, 'index.js')
      );
    }

    for (const cand of candidates) {
      if (this.checkFileExists(cand, fileExists)) {
        return cand;
      }
    }

    // Default fallback if no file exists matching candidates
    if (joined.endsWith('.js')) {
      return joined.slice(0, -3) + '.ts';
    }
    if (joined.endsWith('.jsx')) {
      return joined.slice(0, -4) + '.tsx';
    }
    if (!joined.endsWith('.ts') && !joined.endsWith('.tsx')) {
      return joined + '.ts';
    }
    return joined;
  }

  public async resolveImportPathAsync(
    importPath: string,
    currentFile: string,
    fileExists?: (filePath: string) => boolean | Promise<boolean>
  ): Promise<string | null> {
    if (!importPath.startsWith('.')) {
      return null; // External package
    }

    let joined = path.join(path.dirname(currentFile), importPath);
    joined = joined.split(path.sep).join(path.posix.sep);
    
    // Boundary check
    const absoluteJoined = path.posix.resolve(this.projectRoot, joined);
    if (!absoluteJoined.startsWith(this.projectRoot)) {
      return null;
    }

    const candidates: string[] = [];

    if (joined.endsWith('.js')) {
      const stem = joined.slice(0, -3);
      candidates.push(stem + '.ts', stem + '.tsx', joined);
    } else if (joined.endsWith('.jsx')) {
      const stem = joined.slice(0, -4);
      candidates.push(stem + '.tsx', stem + '.ts', joined);
    } else if (joined.endsWith('.ts') || joined.endsWith('.tsx')) {
      candidates.push(joined);
    } else {
      candidates.push(
        joined + '.ts',
        joined + '.tsx',
        path.posix.join(joined, 'index.ts'),
        path.posix.join(joined, 'index.tsx'),
        joined + '.js',
        path.posix.join(joined, 'index.js')
      );
    }

    for (const cand of candidates) {
      if (await this.checkFileExistsAsync(cand, fileExists)) {
        return cand;
      }
    }

    // Default fallback if no file exists matching candidates
    if (joined.endsWith('.js')) {
      return joined.slice(0, -3) + '.ts';
    }
    if (joined.endsWith('.jsx')) {
      return joined.slice(0, -4) + '.tsx';
    }
    if (!joined.endsWith('.ts') && !joined.endsWith('.tsx')) {
      return joined + '.ts';
    }
    return joined;
  }

  public generateUsageHeatmap(files: string[]): Record<string, number> | Promise<Record<string, number>> {
    const heatmap: Record<string, number> = {};
    const promises: Promise<void>[] = [];

    for (const file of files) {
      const depsResult = this.getDependenciesFor(file);
      
      const processDepsSync = (deps: string[]) => {
        for (const dep of deps) {
          const resolved = this.resolveImportPath(dep, file);
          if (resolved) {
            heatmap[resolved] = (heatmap[resolved] || 0) + 1;
          }
        }
      };

      const processDepsAsync = async (deps: string[]) => {
        for (const dep of deps) {
          const resolved = await this.resolveImportPathAsync(dep, file);
          if (resolved) {
            heatmap[resolved] = (heatmap[resolved] || 0) + 1;
          }
        }
      };

      if (depsResult instanceof Promise) {
        promises.push(depsResult.then(processDepsAsync));
      } else {
        processDepsSync(depsResult);
      }
    }
    
    if (promises.length > 0) {
      return Promise.all(promises).then(() => heatmap);
    }
    
    return heatmap;
  }
}
