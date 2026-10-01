import * as fs from 'node:fs';
import * as path from 'node:path';
import { Project, SyntaxKind, type Node, type CallExpression, type Expression } from 'ts-morph';
import type { RouteManifestNode } from '../types.js';
import { inspectAuthInFile } from '../authInspector.js';

interface ReactRouterParserContext {
  projectRoot: string;
  routesFilePath: string;
  currentPrefix: string;
  currentLayout?: string;
  routes: RouteManifestNode[];
  inspectAuth: boolean;
}

function cleanStringLiteral(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  const text = node.getText();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    return text.slice(1, -1);
  }
  return undefined;
}

function joinPaths(prefix: string, segment: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const cleanSegment = segment.replace(/^\/+|\/+$/g, '');

  if (!cleanPrefix && !cleanSegment) return '/';
  if (!cleanPrefix) return `/${cleanSegment}`;
  if (!cleanSegment) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSegment}`;
}

function extractDynamicParams(routePath: string): string[] {
  const params: string[] = [];
  const segments = routePath.split('/');

  for (const seg of segments) {
    if (seg.startsWith(':')) {
      params.push(seg.slice(1));
    } else if (seg === '*' || seg === '/*') {
      params.push('*');
    } else if (seg.startsWith('*')) {
      params.push(seg.slice(1));
    }
  }

  return params;
}

function resolveProjectRelativePath(projectRoot: string, routesFilePath: string, rawFile: string): string {
  // If rawFile is already absolute
  if (path.isAbsolute(rawFile)) {
    return path.relative(projectRoot, rawFile);
  }

  // Check relative to routesFile dir (e.g. app/)
  const routesDir = path.dirname(routesFilePath);
  const candidateFromRoutesDir = path.resolve(routesDir, rawFile);
  if (fs.existsSync(candidateFromRoutesDir)) {
    return path.relative(projectRoot, candidateFromRoutesDir);
  }

  // Check inside app/
  const candidateInApp = path.resolve(projectRoot, 'app', rawFile);
  if (fs.existsSync(candidateInApp)) {
    return path.relative(projectRoot, candidateInApp);
  }

  // Check directly from projectRoot
  const candidateFromRoot = path.resolve(projectRoot, rawFile);
  if (fs.existsSync(candidateFromRoot)) {
    return path.relative(projectRoot, candidateFromRoot);
  }

  // Default fallback: relative to app/ if routesFile is in app
  if (routesDir.endsWith('app')) {
    return path.join('app', rawFile);
  }

  return rawFile;
}

function processCallExpression(call: CallExpression, context: ReactRouterParserContext): void {
  const expr = call.getExpression();
  const fnName = expr.getText().split('.').pop() ?? '';
  const args = call.getArguments();

  if (fnName === 'index') {
    // index("routes/home.tsx")
    const rawFile = cleanStringLiteral(args[0]) ?? '';
    const fullPath = context.currentPrefix ? joinPaths(context.currentPrefix, '') : '/';
    const filePath = resolveProjectRelativePath(context.projectRoot, context.routesFilePath, rawFile);
    const absFilePath = path.resolve(context.projectRoot, filePath);
    const auth = context.inspectAuth
      ? inspectAuthInFile(absFilePath)
      : { authRequired: false, authGuards: [] };

    context.routes.push({
      path: fullPath,
      rawPath: rawFile,
      filePath,
      layoutFilePath: context.currentLayout,
      isIndex: true,
      dynamicParams: extractDynamicParams(fullPath),
      authRequired: auth.authRequired,
      authGuards: auth.authGuards,
      sourceLocation: {
        filePath: path.relative(context.projectRoot, context.routesFilePath),
        line: call.getStartLineNumber(),
      },
    });
  } else if (fnName === 'route') {
    // route("about", "routes/about.tsx", [children])
    const pathSegment = cleanStringLiteral(args[0]) ?? '';
    const rawFile = cleanStringLiteral(args[1]) ?? '';
    const fullPath = joinPaths(context.currentPrefix, pathSegment);
    const filePath = resolveProjectRelativePath(context.projectRoot, context.routesFilePath, rawFile);
    const absFilePath = path.resolve(context.projectRoot, filePath);
    const auth = context.inspectAuth
      ? inspectAuthInFile(absFilePath)
      : { authRequired: false, authGuards: [] };

    context.routes.push({
      path: fullPath,
      rawPath: pathSegment,
      filePath,
      layoutFilePath: context.currentLayout,
      isIndex: false,
      dynamicParams: extractDynamicParams(fullPath),
      authRequired: auth.authRequired,
      authGuards: auth.authGuards,
      sourceLocation: {
        filePath: path.relative(context.projectRoot, context.routesFilePath),
        line: call.getStartLineNumber(),
      },
    });

    if (args.length > 2 && args[2].getKind() === SyntaxKind.ArrayLiteralExpression) {
      const childArray = args[2].asKind(SyntaxKind.ArrayLiteralExpression)!;
      for (const elem of childArray.getElements()) {
        processRouteNode(elem, {
          ...context,
          currentPrefix: fullPath,
        });
      }
    }
  } else if (fnName === 'layout') {
    // layout("routes/layout.tsx", [children])
    const rawLayout = cleanStringLiteral(args[0]) ?? '';
    const layoutFilePath = resolveProjectRelativePath(context.projectRoot, context.routesFilePath, rawLayout);
    const childrenArg = args[1];

    if (childrenArg && childrenArg.getKind() === SyntaxKind.ArrayLiteralExpression) {
      const childArray = childrenArg.asKind(SyntaxKind.ArrayLiteralExpression)!;
      for (const elem of childArray.getElements()) {
        processRouteNode(elem, {
          ...context,
          currentLayout: layoutFilePath,
        });
      }
    }
  } else if (fnName === 'prefix') {
    // prefix("concerts", [children])
    const prefixStr = cleanStringLiteral(args[0]) ?? '';
    const newPrefix = joinPaths(context.currentPrefix, prefixStr);
    const childrenArg = args[1];

    if (childrenArg && childrenArg.getKind() === SyntaxKind.ArrayLiteralExpression) {
      const childArray = childrenArg.asKind(SyntaxKind.ArrayLiteralExpression)!;
      for (const elem of childArray.getElements()) {
        processRouteNode(elem, {
          ...context,
          currentPrefix: newPrefix,
        });
      }
    }
  }
}

function processRouteNode(node: Expression, context: ReactRouterParserContext): void {
  if (node.getKind() === SyntaxKind.SpreadElement) {
    const innerExpr = (node as any).getExpression?.() as Expression;
    if (innerExpr) {
      processRouteNode(innerExpr, context);
    }
    return;
  }

  if (node.getKind() === SyntaxKind.CallExpression) {
    processCallExpression(node as CallExpression, context);
  }
}

export async function parseReactRouterManifest(options: {
  projectRoot: string;
  routesFile?: string;
  inspectAuth?: boolean;
}): Promise<RouteManifestNode[]> {
  const projectRoot = options.projectRoot;
  let routesFile = options.routesFile;

  if (!routesFile) {
    const candidates = [
      path.join(projectRoot, 'app', 'routes.ts'),
      path.join(projectRoot, 'app', 'routes.tsx'),
      path.join(projectRoot, 'src', 'routes.ts'),
      path.join(projectRoot, 'src', 'routes.tsx'),
      path.join(projectRoot, 'routes.ts'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        routesFile = c;
        break;
      }
    }
  }

  if (!routesFile || !fs.existsSync(routesFile)) {
    return [];
  }

  const content = fs.readFileSync(routesFile, 'utf-8');
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('routes.ts', content);

  const routes: RouteManifestNode[] = [];
  const context: ReactRouterParserContext = {
    projectRoot,
    routesFilePath: routesFile,
    currentPrefix: '',
    currentLayout: undefined,
    routes,
    inspectAuth: options.inspectAuth ?? true,
  };

  // Find array literal (from default export, named export routes, or first array with routes)
  const arrayLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression);
  if (arrayLiterals.length > 0) {
    const rootArray = arrayLiterals[0];
    for (const element of rootArray.getElements()) {
      processRouteNode(element, context);
    }
  }

  return routes;
}
