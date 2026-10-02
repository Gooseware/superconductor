import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CrawlerConfig, ViewportPreset } from './types.js';

export function findSystemChromium(): string | undefined {
  const candidates = [
    '/usr/local/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/home/gooseware/.local/bin/chromium',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function resolveChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (fs.existsSync('/usr/local/bin/google-chrome-stable')) {
    return '/usr/local/bin/google-chrome-stable';
  }
  return (
    findSystemChromium() ||
    '/home/gooseware/.local/bin/chromium'
  );
}

export const DEFAULT_CHROMIUM_PATH = resolveChromiumPath();
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_CONCRETE_PER_PARAM = 2;
export const DEFAULT_OUTPUT_DIR_NAME = '.superconductor/crawler';

export const DEFAULT_VIEWPORTS: ViewportPreset[] = [
  {
    name: 'desktop',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    name: 'tablet',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
];

export function resolveCrawlerConfig(
  options: Partial<CrawlerConfig> & { projectRoot: string }
): CrawlerConfig {
  const projectRoot = options.projectRoot;
  const rawOutputDir = options.outputDir ?? path.join(projectRoot, DEFAULT_OUTPUT_DIR_NAME);
  const outputDir = path.isAbsolute(rawOutputDir)
    ? rawOutputDir
    : path.resolve(projectRoot, rawOutputDir);

  return {
    projectRoot,
    baseUrl: options.baseUrl,
    routesFile: options.routesFile,
    viewports: options.viewports ?? DEFAULT_VIEWPORTS,
    outputDir,
    maxConcretePerParam: options.maxConcretePerParam ?? DEFAULT_MAX_CONCRETE_PER_PARAM,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    chromiumPath: options.chromiumPath ?? DEFAULT_CHROMIUM_PATH,
  };
}
