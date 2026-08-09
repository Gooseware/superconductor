import * as fs from 'node:fs';
import * as path from 'node:path';
import { Project, SyntaxKind, Node } from 'ts-morph';

export interface TestTheatreFinding {
  file: string;
  line: number;
  testName: string;
  eventsFound: string[];
}

export class TestTheatreDetector {
  scan(filePath: string): TestTheatreFinding[] {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return [];
    }

    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        jsx: 1, // JsxEmit.Preserve
      },
    });

    const sourceFile = project.addSourceFileAtPath(filePath);
    const findings: TestTheatreFinding[] = [];

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const callExpr of callExpressions) {
      if (!this.isTestCall(callExpr)) {
        continue;
      }

      const testName = this.extractTestName(callExpr);
      const args = callExpr.getArguments();
      const testCallback = args[1];

      if (!testCallback) {
        continue;
      }

      const innerCalls = testCallback.getDescendantsOfKind(SyntaxKind.CallExpression);
      const eventsFound: string[] = [];
      let hasExpect = false;

      for (const innerCall of innerCalls) {
        const exprText = innerCall.getExpression().getText();

        if (this.isExpectCall(exprText)) {
          hasExpect = true;
        }

        if (this.isEventCall(exprText)) {
          eventsFound.push(exprText);
        }
      }

      if (eventsFound.length > 0 && !hasExpect) {
        findings.push({
          file: filePath,
          line: callExpr.getStartLineNumber(),
          testName,
          eventsFound,
        });
      }
    }

    return findings;
  }

  scanDirectory(dir: string): TestTheatreFinding[] {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return [];
    }

    const findings: TestTheatreFinding[] = [];
    const files = this.getFilesRecursively(dir);

    for (const file of files) {
      findings.push(...this.scan(file));
    }

    return findings;
  }

  private isTestCall(callExpr: Node): boolean {
    if (!Node.isCallExpression(callExpr)) {
      return false;
    }
    const expr = callExpr.getExpression();
    const text = expr.getText();

    if (text === 'it' || text === 'test') {
      return true;
    }

    if (Node.isPropertyAccessExpression(expr)) {
      const objText = expr.getExpression().getText();
      if (objText === 'it' || objText === 'test') {
        return true;
      }
    }

    return false;
  }

  private extractTestName(callExpr: Node): string {
    if (!Node.isCallExpression(callExpr)) {
      return 'anonymous';
    }
    const args = callExpr.getArguments();
    if (args.length === 0) {
      return 'anonymous';
    }

    const firstArg = args[0];
    if (Node.isStringLiteral(firstArg) || Node.isNoSubstitutionTemplateLiteral(firstArg)) {
      return firstArg.getLiteralValue();
    }

    return firstArg.getText().replace(/^['"`]|['"`]$/g, '');
  }

  private isExpectCall(exprText: string): boolean {
    return (
      exprText === 'expect' ||
      exprText.startsWith('expect.') ||
      exprText.startsWith('expect(')
    );
  }

  private isEventCall(exprText: string): boolean {
    return (
      exprText === 'fireEvent' ||
      exprText.startsWith('fireEvent.') ||
      exprText === 'userEvent' ||
      exprText.startsWith('userEvent.') ||
      exprText === 'pointerEvent' ||
      exprText.startsWith('pointerEvent.') ||
      exprText === 'dispatchEvent' ||
      exprText.endsWith('.dispatchEvent')
    );
  }

  private getFilesRecursively(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.getFilesRecursively(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  }
}
