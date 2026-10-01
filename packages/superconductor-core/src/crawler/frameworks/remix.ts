import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RouteManifestNode } from '../types.js';
import { inspectAuthInFile } from '../authInspector.js';

const ROUTE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];

function getSourceLineNumber(content: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export default') || lines[i].includes('export async function loader') || lines[i].includes('export const loader')) {
      return i + 1;
    }
  }
  return 1;
}

export function parseRemixRouteId(routeId: string): {
  path: string;
  isIndex: boolean;
  dynamicParams: string[];
  isPathlessOnly: boolean;
} {
  if (routeId === '_index' || routeId === 'index') {
    return { path: '/', isIndex: true, dynamicParams: [], isPathlessOnly: false };
  }

  const rawSegments = routeId.split('.');
  const lastSegment = rawSegments[rawSegments.length - 1];
  const isIndex = lastSegment === '_index' || lastSegment === 'index';

  const pathSegments = isIndex ? rawSegments.slice(0, -1) : rawSegments;
  const urlSegments: string[] = [];
  const dynamicParams: string[] = [];

  for (let seg of pathSegments) {
    // Pathless layout segment: starts with _ and does NOT end with _
    if (seg.startsWith('_') && !seg.endsWith('_')) {
      continue;
    }

    // Trailing underscore indicates escaping nesting
    if (seg.endsWith('_')) {
      seg = seg.slice(0, -1);
    }

    if (seg.startsWith('_')) {
      seg = seg.slice(1);
    }

    if (seg === '$') {
      urlSegments.push('*');
      dynamicParams.push('*');
    } else if (seg.startsWith('$')) {
      const paramName = seg.slice(1);
      urlSegments.push(`:${paramName}`);
      dynamicParams.push(paramName);
    } else if (seg) {
      urlSegments.push(seg);
    }
  }

  if (urlSegments.length === 0) {
    return {
      path: '/',
      isIndex,
      dynamicParams: [],
      isPathlessOnly: !isIndex,
    };
  }

  return {
    path: `/${urlSegments.join('/')}`,
    isIndex,
    dynamicParams,
    isPathlessOnly: false,
  };
}

function findRemixLayout(
  routesDir: string,
  routeId: string,
  projectRoot: string
): string | undefined {
  const parts = routeId.split('.');
  // Check progressively shorter prefixes: e.g. "_auth.login" -> "_auth"
  for (let i = parts.length - 1; i > 0; i--) {
    const candidatePrefix = parts.slice(0, i).join('.');
    for (const ext of ROUTE_EXTENSIONS) {
      const candidatePath = path.join(routesDir, `${candidatePrefix}${ext}`);
      if (fs.existsSync(candidatePath)) {
        return path.relative(projectRoot, candidatePath);
      }
      const candidateDirPath = path.join(routesDir, candidatePrefix, `route${ext}`);
      if (fs.existsSync(candidateDirPath)) {
        return path.relative(projectRoot, candidateDirPath);
      }
    }
  }
  return undefined;
}

export async function parseRemixManifest(options: {
  projectRoot: string;
  routesDir?: string;
  inspectAuth?: boolean;
}): Promise<RouteManifestNode[]> {
  const projectRoot = options.projectRoot;
  let routesDir = options.routesDir;

  if (!routesDir) {
    const candidates = [
      path.join(projectRoot, 'app', 'routes'),
      path.join(projectRoot, 'src', 'routes'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        routesDir = c;
        break;
      }
    }
  }

  if (!routesDir || !fs.existsSync(routesDir)) {
    return [];
  }

  const entries = fs.readdirSync(routesDir, { withFileTypes: true });
  const routes: RouteManifestNode[] = [];
  const inspectAuth = options.inspectAuth ?? true;

  for (const entry of entries) {
    let routeId = '';
    let filePath = '';

    if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!ROUTE_EXTENSIONS.includes(ext) || entry.name.endsWith('.d.ts')) {
        continue;
      }
      routeId = path.basename(entry.name, ext);
      filePath = path.join(routesDir, entry.name);
    } else if (entry.isDirectory()) {
      // Folder-based flat route: e.g. app/routes/users.$userId/route.tsx
      routeId = entry.name;
      for (const ext of ROUTE_EXTENSIONS) {
        const candidate = path.join(routesDir, entry.name, `route${ext}`);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }
      if (!filePath) continue;
    }

    const { path: routePath, isIndex, dynamicParams, isPathlessOnly } = parseRemixRouteId(routeId);

    // Skip pure pathless layout files from route manifest (they will be captured as layoutFilePath)
    if (isPathlessOnly) {
      continue;
    }

    const relFilePath = path.relative(projectRoot, filePath);
    const layoutFilePath = findRemixLayout(routesDir, routeId, projectRoot);
    const content = fs.readFileSync(filePath, 'utf-8');
    const line = getSourceLineNumber(content);

    const auth = inspectAuth
      ? inspectAuthInFile(filePath)
      : { authRequired: false, authGuards: [] };

    routes.push({
      path: routePath,
      rawPath: entry.name,
      filePath: relFilePath,
      layoutFilePath,
      isIndex,
      dynamicParams,
      authRequired: auth.authRequired,
      authGuards: auth.authGuards,
      sourceLocation: {
        filePath: relFilePath,
        line,
      },
    });
  }

  return routes;
}
