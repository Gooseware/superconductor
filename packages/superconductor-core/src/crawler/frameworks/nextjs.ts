import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RouteManifestNode } from '../types.js';
import { inspectAuthInFile } from '../authInspector.js';

const PAGE_FILE_NAMES = new Set(['page.tsx', 'page.jsx', 'page.js', 'page.ts']);
const LAYOUT_FILE_NAMES = ['layout.tsx', 'layout.jsx', 'layout.js', 'layout.ts'];

function getSourceLineNumber(content: string): number {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export default') || lines[i].includes('export function') || lines[i].includes('export const')) {
      return i + 1;
    }
  }
  return 1;
}

function findNearestLayout(startDir: string, appDir: string, projectRoot: string): string | undefined {
  let curr = startDir;
  while (true) {
    for (const layoutName of LAYOUT_FILE_NAMES) {
      const candidate = path.join(curr, layoutName);
      if (fs.existsSync(candidate)) {
        return path.relative(projectRoot, candidate);
      }
    }
    if (curr === appDir) {
      break;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return undefined;
}

function parseNextJsFolderSegments(folderRelToApp: string): {
  path: string;
  isIndex: boolean;
  dynamicParams: string[];
} {
  if (!folderRelToApp || folderRelToApp === '.' || folderRelToApp === '') {
    return { path: '/', isIndex: true, dynamicParams: [] };
  }

  const rawSegments = folderRelToApp.split(path.sep);
  const urlSegments: string[] = [];
  const dynamicParams: string[] = [];

  for (const seg of rawSegments) {
    // Skip Route Groups: e.g. (marketing), (auth)
    if (seg.startsWith('(') && seg.endsWith(')')) {
      continue;
    }

    // Skip Parallel Route Slots: e.g. @modal
    if (seg.startsWith('@')) {
      continue;
    }

    // Catch-all: [...slug] or [[...slug]]
    const catchAllMatch = seg.match(/^\[{1,2}\.{3}([a-zA-Z0-9_]+)\]{1,2}$/);
    if (catchAllMatch) {
      urlSegments.push('*');
      dynamicParams.push(catchAllMatch[1]);
      continue;
    }

    // Dynamic param: [id]
    const dynamicMatch = seg.match(/^\[([a-zA-Z0-9_]+)\]$/);
    if (dynamicMatch) {
      urlSegments.push(`:${dynamicMatch[1]}`);
      dynamicParams.push(dynamicMatch[1]);
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
    isIndex: false,
    dynamicParams,
  };
}

function collectPageFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPageFiles(fullPath, fileList);
    } else if (entry.isFile() && PAGE_FILE_NAMES.has(entry.name)) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

export async function parseNextJsManifest(options: {
  projectRoot: string;
  appDir?: string;
  inspectAuth?: boolean;
}): Promise<RouteManifestNode[]> {
  const projectRoot = options.projectRoot;
  let appDir = options.appDir;

  if (!appDir) {
    const candidates = [
      path.join(projectRoot, 'app'),
      path.join(projectRoot, 'src', 'app'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        appDir = c;
        break;
      }
    }
  }

  if (!appDir || !fs.existsSync(appDir)) {
    return [];
  }

  const pageFiles = collectPageFiles(appDir);
  const routes: RouteManifestNode[] = [];
  const inspectAuth = options.inspectAuth ?? true;

  for (const pageFile of pageFiles) {
    const folder = path.dirname(pageFile);
    const folderRelToApp = path.relative(appDir, folder);
    const { path: routePath, isIndex, dynamicParams } = parseNextJsFolderSegments(folderRelToApp);

    const relFilePath = path.relative(projectRoot, pageFile);
    const layoutFilePath = findNearestLayout(folder, appDir, projectRoot);
    const content = fs.readFileSync(pageFile, 'utf-8');
    const line = getSourceLineNumber(content);

    let authRequired = false;
    const authGuards: string[] = [];

    if (inspectAuth) {
      const pageAuth = inspectAuthInFile(pageFile);
      authRequired = pageAuth.authRequired;
      authGuards.push(...pageAuth.authGuards);

      if (layoutFilePath) {
        const layoutAbs = path.resolve(projectRoot, layoutFilePath);
        const layoutAuth = inspectAuthInFile(layoutAbs);
        if (layoutAuth.authRequired) {
          authRequired = true;
          for (const g of layoutAuth.authGuards) {
            if (!authGuards.includes(g)) {
              authGuards.push(g);
            }
          }
        }
      }
    }

    routes.push({
      path: routePath,
      rawPath: folderRelToApp || '/',
      filePath: relFilePath,
      layoutFilePath,
      isIndex,
      dynamicParams,
      authRequired,
      authGuards,
      sourceLocation: {
        filePath: relFilePath,
        line,
      },
    });
  }

  return routes;
}
