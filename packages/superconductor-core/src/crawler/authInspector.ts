import * as fs from 'node:fs';
import { Project, SyntaxKind } from 'ts-morph';
import type { AuthInspectionResult } from './types.js';

const AUTH_CALL_PATTERNS = new Set([
  'requireUser',
  'requireAuth',
  'requireUserId',
  'getSession',
  'auth',
  'verifySession',
  'ensureAuthenticated',
  'useAuth',
  'useSession',
  'useUser',
  'useAuthenticatedUser',
]);

const AUTH_JSX_PATTERNS = new Set([
  'ProtectedRoute',
  'AuthGuard',
  'RequireAuth',
  'Authenticated',
  'Protect',
  'RequireUser',
]);

export function inspectAuthSource(sourceText: string): AuthInspectionResult {
  const guards = new Set<string>();

  try {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile('temp.tsx', sourceText);

    // 1. Inspect Call Expressions (functions & hooks like requireUser, getSession, useAuth)
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExpressions) {
      const expr = call.getExpression();
      const exprText = expr.getText();

      // Check simple identifier: requireUser() or useAuth()
      for (const pattern of AUTH_CALL_PATTERNS) {
        if (exprText === pattern || exprText.endsWith(`.${pattern}`)) {
          guards.add(pattern);
        }
      }
    }

    // 2. Inspect JSX Elements (<ProtectedRoute>, <AuthGuard>, etc.)
    const openingElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement);
    for (const elem of openingElements) {
      const tag = elem.getTagNameNode().getText();
      for (const pattern of AUTH_JSX_PATTERNS) {
        if (tag === pattern || tag.endsWith(`.${pattern}`)) {
          guards.add(pattern);
        }
      }
    }

    const selfClosingElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement);
    for (const elem of selfClosingElements) {
      const tag = elem.getTagNameNode().getText();
      for (const pattern of AUTH_JSX_PATTERNS) {
        if (tag === pattern || tag.endsWith(`.${pattern}`)) {
          guards.add(pattern);
        }
      }
    }
  } catch {
    // If AST parsing fails, fallback to regex scanning
    for (const pattern of AUTH_CALL_PATTERNS) {
      const regex = new RegExp(`\\b${pattern}\\s*\\(`, 'm');
      if (regex.test(sourceText)) {
        guards.add(pattern);
      }
    }
    for (const pattern of AUTH_JSX_PATTERNS) {
      const regex = new RegExp(`<${pattern}(\\s|>)`, 'm');
      if (regex.test(sourceText)) {
        guards.add(pattern);
      }
    }
  }

  const authGuards = Array.from(guards);
  return {
    authRequired: authGuards.length > 0,
    authGuards,
  };
}

export function inspectAuthInFile(filePath: string): AuthInspectionResult {
  if (!fs.existsSync(filePath)) {
    return { authRequired: false, authGuards: [] };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return inspectAuthSource(content);
  } catch {
    return { authRequired: false, authGuards: [] };
  }
}
