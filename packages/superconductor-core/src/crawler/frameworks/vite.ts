import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RouteManifestNode } from '../types.js';
import { inspectAuthInFile } from '../authInspector.js';

const ROUTE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js'];
const LAYOUT_NAMES = ['_layout.tsx', '_layout.jsx', 'layout.tsx', 'layout.jsx'];

function getSourceLineNumber(content: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export default') || lines[i].includes('export function') || lines[i].includes('export const')) {
      return i + 1;
    }
  }
  return 1;
}

function findViteLayout(startDir: string, pagesDir: string, projectRoot: string): string | undefined {
  let curr = startDir;
  while (true) {
    for (const layoutName of LAYOUT_NAMES) {
      const candidate = path.join(curr, layoutName);
      if (fs.existsSync(candidate)) {
        return path.relative(projectRoot, candidate);
      }
    }
    if (curr === pagesDir) {
      break;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return undefined;
}

function parseViteRouteSegments(relPathWithoutExt: string): {
  path: string;
  isIndex: boolean;
  dynamicParams: string[];
} {
  const rawSegments = relPathWithoutExt.split(path.sep);
  const lastSeg = rawSegments[rawSegments.length - 1];
  const isIndex = lastSeg === 'index' || lastSeg === '_index';

  const segmentsToProcess = isIndex ? rawSegments.slice(0, -1) : rawSegments;
  const urlSegments: string[] = [];
  const dynamicParams: string[] = [];

  for (const seg of segmentsToProcess) {
    // Catch-all: [...all]
    const catchAllMatch = seg.match(/^\[\.{3}([a-zA-Z0-9_]+)\]$/);
    if (catchAllMatch) {
      urlSegments.push('*');
      dynamicParams.push(catchAllMatch[1]);
      continue;
    }

    // Dynamic param: [id]
    const bracketMatch = seg.match(/^\[([a-zA-Z0-9_]+)\]$/);
    if (bracketMatch) {
      urlSegments.push(`:${bracketMatch[1]}`);
      dynamicParams.push(bracketMatch[1]);
      continue;
    }

    // Colon param: :id
    if (seg.startsWith(':')) {
      urlSegments.push(seg);
      dynamicParams.push(seg.slice(1));
      continue;
    }

    if (seg) {
      urlSegments.push(seg);
    }
  }

  if (urlSegments.length === 0) {
    return { path: '/', isIndex: true, dynamicParams: [] };
  }

  return {
    path: `/${urlSegments.join('/')}`,
    isIndex,
    dynamicParams,
  };
}

function collectViteRouteFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectViteRouteFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (
        ROUTE_EXTENSIONS.includes(ext) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.includes('.test.') &&
        !entry.name.includes('.spec.') &&
        !entry.name.startsWith('_') // skip _layout, _app, etc.
      ) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
}

export async function parseVitePagesManifest(options: {
  projectRoot: string;
  pagesDir?: string;
  inspectAuth?: boolean;
}): Promise<RouteManifestNode[]> {
  const projectRoot = options.projectRoot;
  let pagesDir = options.pagesDir;

  if (!pagesDir) {
    const candidates = [
      path.join(projectRoot, 'src', 'pages'),
      path.join(projectRoot, 'pages'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        pagesDir = c;
        break;
      }
    }
  }

  if (!pagesDir || !fs.existsSync(pagesDir)) {
    return [];
  }

  const pageFiles = collectViteRouteFiles(pagesDir);
  const routes: RouteManifestNode[] = [];
  const inspectAuth = options.inspectAuth ?? true;

  for (const pageFile of pageFiles) {
    const relToPages = path.relative(pagesDir, pageFile);
    const ext = path.extname(relToPages);
    const relWithoutExt = relToPages.slice(0, -ext.length);

    const { path: routePath, isIndex, dynamicParams } = parseViteRouteSegments(relWithoutExt);
    const relFilePath = path.relative(projectRoot, pageFile);
    const layoutFilePath = findViteLayout(path.dirname(pageFile), pagesDir, projectRoot);
    const content = fs.readFileSync(pageFile, 'utf-8');
    const line = getSourceLineNumber(content);

    const auth = inspectAuth
      ? inspectAuthInFile(pageFile)
      : { authRequired: false, authGuards: [] };

    routes.push({
      path: routePath,
      rawPath: relWithoutExt,
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
