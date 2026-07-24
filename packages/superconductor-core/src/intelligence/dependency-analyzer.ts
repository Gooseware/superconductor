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
      target: 'es2022',
      comments: false,
      script: true,
    });

    const imports: string[] = [];

    const walk = (node: any) => {
      if (!node) return;
      if (node.type === 'ImportDeclaration') {
        imports.push(node.source.value);
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
