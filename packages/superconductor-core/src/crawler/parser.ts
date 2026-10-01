import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RouteManifest, RouteManifestNode, ParseOptions, SupportedFramework } from './types.js';
import { parseReactRouterManifest } from './frameworks/reactRouter.js';
import { parseRemixManifest } from './frameworks/remix.js';
import { parseNextJsManifest } from './frameworks/nextjs.js';
import { parseVitePagesManifest } from './frameworks/vite.js';

export {
  parseReactRouterManifest,
  parseRemixManifest,
  parseNextJsManifest,
  parseVitePagesManifest,
};

export function detectFramework(
  projectRoot: string,
  options?: ParseOptions
): SupportedFramework | 'unknown' {
  if (options?.framework && options.framework !== 'auto') {
    return options.framework;
  }

  // 1. React Router v7 routes file check
  if (options?.routesFile && fs.existsSync(options.routesFile)) {
    return 'react-router';
  }
  const rrFileCandidates = [
    path.join(projectRoot, 'app', 'routes.ts'),
    path.join(projectRoot, 'app', 'routes.tsx'),
  ];
  for (const c of rrFileCandidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return 'react-router';
    }
  }

  // 2. Remix routes directory check
  const remixCandidates = [
    path.join(projectRoot, 'app', 'routes'),
    path.join(projectRoot, 'src', 'routes'),
  ];
  for (const c of remixCandidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      return 'remix';
    }
  }

  // 3. Next.js App Router check (app/page.* or src/app/page.*)
  const nextAppCandidates = [
    path.join(projectRoot, 'app'),
    path.join(projectRoot, 'src', 'app'),
  ];
  for (const dir of nextAppCandidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      const pageExtensions = ['.tsx', '.jsx', '.ts', '.js'];
      const hasPage = pageExtensions.some(ext =>
        fs.existsSync(path.join(dir, `page${ext}`))
      );
      if (hasPage) {
        return 'nextjs';
      }
      // Or has any subdirectory with page.tsx
      try {
        const files = fs.readdirSync(dir);
        if (files.some(f => f.startsWith('page.') || f === 'layout.tsx' || f === 'layout.jsx')) {
          return 'nextjs';
        }
      } catch {
        // ignore
      }
    }
  }

  // 4. Vite Pages check (src/pages or pages)
  const viteCandidates = [
    path.join(projectRoot, 'src', 'pages'),
    path.join(projectRoot, 'pages'),
  ];
  for (const dir of viteCandidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return 'vite';
    }
  }

  return 'unknown';
}

export async function parseRouteManifest(optionsOrRoot: ParseOptions | string): Promise<RouteManifest> {
  const options: ParseOptions = typeof optionsOrRoot === 'string'
    ? { projectRoot: optionsOrRoot }
    : optionsOrRoot;
  const framework = detectFramework(options.projectRoot, options);
  let routes: RouteManifestNode[] = [];

  switch (framework) {
    case 'react-router':
      routes = await parseReactRouterManifest({
        projectRoot: options.projectRoot,
        routesFile: options.routesFile,
        inspectAuth: options.inspectAuth,
      });
      break;

    case 'remix':
      routes = await parseRemixManifest({
        projectRoot: options.projectRoot,
        inspectAuth: options.inspectAuth,
      });
      break;

    case 'nextjs':
      routes = await parseNextJsManifest({
        projectRoot: options.projectRoot,
        inspectAuth: options.inspectAuth,
      });
      break;

    case 'vite':
      routes = await parseVitePagesManifest({
        projectRoot: options.projectRoot,
        inspectAuth: options.inspectAuth,
      });
      break;

    default:
      routes = [];
      break;
  }

  return {
    framework,
    routes,
  };
}
