import * as swc from '@swc/core';

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

  public async parseImports(sourceCode: string): Promise<string[]> {
    const ast = await swc.parse(sourceCode, {
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

  public async getDependenciesFor(filePath: string): Promise<string[]> {
    const sourceCode = await this.fileReader(filePath);
    return this.parseImports(sourceCode);
  }
}
