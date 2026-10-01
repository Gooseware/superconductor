import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CrawlerConfig,
  FlowManifest,
  FlowNode,
  FlowTransition,
  RouteManifest,
  RouteManifestNode,
  RouteMarker,
  ScreenshotMetadata,
  UserFlowGraph,
  ViewportPreset,
} from './types.js';
import {
  DEFAULT_CHROMIUM_PATH,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VIEWPORTS,
  resolveCrawlerConfig,
} from './config.js';
import { parseRouteManifest } from './parser.js';
import { DevServerManager, type SpawnDevServerResult } from './serverManager.js';
import { HeadlessCrawlerEngine, captureWebPScreenshot } from './runner.js';
import { JourneyVideoRecorder } from './video.js';
import { AffordanceProber } from './prober.js';
import { FlowGraphBuilder } from './graph.js';
import { ManifestBuilder } from './manifest.js';
import { WireframeBoardEmitter } from './renderer.js';

export interface CrawlProjectOptions {
  projectRoot: string;
  baseUrl?: string;
  outputDir?: string;
  routesFile?: string;
  chromiumPath?: string;
  recordVideo?: boolean;
  standalone?: boolean;
  maxConcretePerParam?: number;
  timeoutMs?: number;
  devServerCommand?: string;
  devServerArgs?: string[];
  viewports?: ViewportPreset[];
  headless?: boolean;
  onProgress?: (message: string) => void;
}

export interface CrawlProjectResult {
  graph: UserFlowGraph;
  manifest: FlowManifest;
  htmlPath: string;
  jsonPath: string;
  videoPath?: string;
  markers: RouteMarker[];
  totalScreens: number;
  durationMs: number;
}

export const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data',
  '100.100.100.200',
]);

/**
 * Validates a crawler baseUrl for SSRF and loopback confinement.
 * Strictly enforces that hostname is in ['127.0.0.1', 'localhost', '::1', '[::1]']
 * and rejects cloud metadata endpoints or external domains.
 */
export function validateBaseUrl(baseUrl: string): void {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error(`Invalid baseUrl: must be a non-empty string`);
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl '${baseUrl}': not a valid URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid baseUrl '${baseUrl}': protocol must be http or https`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');

  if (
    BLOCKED_METADATA_HOSTS.has(hostname) ||
    BLOCKED_METADATA_HOSTS.has(normalizedHost) ||
    normalizedHost.startsWith('169.254.')
  ) {
    throw new Error(
      `SSRF security violation: cloud metadata endpoint '${hostname}' is prohibited`
    );
  }

  if (
    !ALLOWED_LOOPBACK_HOSTS.has(hostname) &&
    !ALLOWED_LOOPBACK_HOSTS.has(normalizedHost)
  ) {
    throw new Error(
      `SSRF security violation: baseUrl '${baseUrl}' is not a permitted loopback address (allowed: 127.0.0.1, localhost, ::1)`
    );
  }
}

/**
 * Expands dynamic route segments (e.g. :id, [id], [...slug], *, /*)
 * into concrete paths, strictly capping dynamic parameters at N <= 2 combinations.
 */
export function expandDynamicRoutes(route: RouteManifestNode, maxConcrete = 2): string[] {
  const dynamicParams = [...(route.dynamicParams || [])];
  if (
    dynamicParams.length === 0 &&
    (route.path.includes('*') || route.path.includes(':') || /\[.*\]/.test(route.path))
  ) {
    dynamicParams.push('all');
  }

  if (dynamicParams.length === 0) {
    return [route.path];
  }

  const count = Math.min(Math.max(maxConcrete, 1), 2);
  const concretePaths: string[] = [];

  for (let i = 1; i <= count; i++) {
    let p = route.path;
    for (const param of dynamicParams) {
      const sampleVal =
        param.toLowerCase().includes('slug') ||
        param.toLowerCase().includes('name') ||
        param.toLowerCase().includes('all') ||
        param === '*'
          ? `item-${i}`
          : `${i}`;

      let paramMatched = false;

      // React Router param: :param
      if (new RegExp(`:${param}\\b`).test(p)) {
        p = p.replace(new RegExp(`:${param}\\b`, 'g'), sampleVal);
        paramMatched = true;
      }
      // Next.js catch-all: [...param]
      if (new RegExp(`\\[\\.\\.\\.${param}\\]`).test(p)) {
        p = p.replace(new RegExp(`\\[\\.\\.\\.${param}\\]`, 'g'), sampleVal);
        paramMatched = true;
      }
      // Next.js dynamic param: [param]
      if (new RegExp(`\\[${param}\\]`).test(p)) {
        p = p.replace(new RegExp(`\\[${param}\\]`, 'g'), sampleVal);
        paramMatched = true;
      }
      // Explicit wildcard token: *
      if (param === '*') {
        if (p.includes('/*')) {
          p = p.replace(/\/\*/g, `/${sampleVal}`);
        } else {
          p = p.replace(/\*/g, sampleVal);
        }
        paramMatched = true;
      }

      // If param was not found in named placeholders and route path contains /* or *, expand wildcard
      if (!paramMatched && (p.includes('/*') || p.includes('*'))) {
        if (p.includes('/*')) {
          p = p.replace(/\/\*/g, `/${sampleVal}`);
        } else {
          p = p.replace(/\*/g, sampleVal);
        }
      }
    }

    // Clean up any remaining wildcard patterns
    if (p.includes('/*')) {
      p = p.replace(/\/\*/g, `/item-${i}`);
    } else if (p.includes('*')) {
      p = p.replace(/\*/g, `item-${i}`);
    }

    concretePaths.push(p);
  }

  return Array.from(new Set(concretePaths));
}

/**
 * Unified Automated App Wireframe & Route Flow Crawler pipeline orchestrator.
 */
export async function crawlProject(options: CrawlProjectOptions): Promise<CrawlProjectResult> {
  const startTime = Date.now();
  const projectRoot = path.resolve(options.projectRoot);

  if (options.baseUrl) {
    validateBaseUrl(options.baseUrl);
  }

  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project root does not exist: ${projectRoot}`);
  }

  const rawOutputDir = options.outputDir ?? path.join(projectRoot, 'superconductor', 'wireframes');
  const outputDir = path.isAbsolute(rawOutputDir)
    ? rawOutputDir
    : path.resolve(projectRoot, rawOutputDir);

  const screenshotsDir = path.join(outputDir, 'screenshots');
  const recordingsDir = path.join(outputDir, 'recordings');
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.mkdir(screenshotsDir, { recursive: true });

  const recordVideo = options.recordVideo !== false;
  if (recordVideo) {
    await fs.promises.mkdir(recordingsDir, { recursive: true });
  }

  // 1. Route Ingestion
  options.onProgress?.('Analyzing application routes...');
  let routeManifest: RouteManifest;
  try {
    routeManifest = await parseRouteManifest({
      projectRoot,
      routesFile: options.routesFile,
    });
  } catch {
    routeManifest = { framework: 'unknown', routes: [] };
  }

  // Fallback if no routes found (e.g. single-page or plain index)
  if (routeManifest.routes.length === 0) {
    routeManifest.routes = [
      {
        path: '/',
        rawPath: '/',
        filePath: 'index.html',
        isIndex: true,
        dynamicParams: [],
        authRequired: false,
        authGuards: [],
        sourceLocation: { filePath: 'index.html', line: 1 },
      },
    ];
  }
  options.onProgress?.(`Route analysis complete: identified ${routeManifest.routes.length} route(s) (${routeManifest.framework})`);

  // 2. Dev Server Probing / Spawning
  options.onProgress?.('Probing development server...');
  let baseUrl = options.baseUrl;
  let spawnedServer: SpawnDevServerResult | null = null;

  if (!baseUrl) {
    const activeUrl = await DevServerManager.detectActiveServer();
    if (activeUrl) {
      baseUrl = activeUrl;
      options.onProgress?.(`Active dev server detected at ${baseUrl}`);
    } else {
      options.onProgress?.('No active server detected; spawning local dev server...');
      spawnedServer = await DevServerManager.spawnDevServer({
        projectRoot,
        command: options.devServerCommand,
        args: options.devServerArgs,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
      baseUrl = spawnedServer.url;
      options.onProgress?.(`Dev server spawned at ${baseUrl}`);
    }
  } else {
    options.onProgress?.(`Using provided base URL: ${baseUrl}`);
  }

  // Validate base URL for SSRF & Loopback Confinement
  validateBaseUrl(baseUrl);

  // Normalize base URL
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // 3. Headless Engine & Video Recorder Setup
  let recorder: JourneyVideoRecorder | null = null;
  if (recordVideo) {
    recorder = new JourneyVideoRecorder({
      videoOutputDir: recordingsDir,
      videoSize: { width: 1280, height: 800 },
      baseStartTimeMs: startTime,
    });
  }

  options.onProgress?.('Launching headless browser engine (Chromium)...');
  const engine = new HeadlessCrawlerEngine({
    executablePath: options.chromiumPath ?? DEFAULT_CHROMIUM_PATH,
    headless: options.headless ?? true,
    recordVideo: recorder ? recorder.getRecordVideoOptions() : undefined,
  });

  const graphBuilder = new FlowGraphBuilder();
  const prober = new AffordanceProber();
  const manifestBuilder = new ManifestBuilder({
    appRoot: projectRoot,
    framework: routeManifest.framework,
  });
  manifestBuilder.addRoutes(routeManifest.routes);

  let finalVideoPath: string | undefined;

  try {
    await engine.start();
    options.onProgress?.('Headless browser engine initialized');
    const page = await engine.createPage('desktop');

    // Attach strict non-GET interception
    await prober.attachNetworkInterceptor(page, baseUrl);

    // 4. Route Crawl Loop
    options.onProgress?.(`Beginning route crawl across ${routeManifest.routes.length} route(s)...`);
    for (const routeNode of routeManifest.routes) {
      const concretePaths = expandDynamicRoutes(
        routeNode,
        options.maxConcretePerParam ?? 2
      );

      for (const concretePath of concretePaths) {
        options.onProgress?.(`Crawling route '${concretePath}' across viewports...`);
        const screenSlug =
          concretePath === '/'
            ? 'root'
            : concretePath.replace(/^\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const screenId = `screen_${screenSlug}`;
        const baseNodeId = `route:${concretePath}`;

        const fullUrl = `${baseUrl}${concretePath.startsWith('/') ? '' : '/'}${concretePath}`;

        if (recorder) {
          recorder.startSession(screenId, concretePath, 'navigate', 'desktop');
        }

        try {
          await page.goto(fullUrl, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs ?? 15000,
          });
        } catch (navErr) {
          // If navigation failed, record error note and continue
          if (recorder) {
            recorder.endSession(screenId);
          }
          continue;
        }

        // Enforce Deterministic Hydration Barrier
        try {
          await engine.waitForHydration(page, options.timeoutMs ?? 10000);
        } catch {
          // If hydration times out, proceed with captured DOM state
        }

        const nodeScreenshots: Record<string, string> = {};
        const validScreenshots: ScreenshotMetadata[] = [];

        // Desktop Viewport Capture (1280x800)
        await engine.switchViewport(page, 'desktop');
        await page.waitForTimeout(100);
        let desktopShot = '';
        try {
          desktopShot = await captureWebPScreenshot(page);
        } catch {
          try {
            const buf = await page.screenshot({ type: 'png' });
            desktopShot = buf.toString('base64');
          } catch {}
        }

        const desktopFile = path.join(screenshotsDir, `desktop_${screenSlug}.webp`);
        if (desktopShot) {
          try {
            await fs.promises.writeFile(desktopFile, Buffer.from(desktopShot, 'base64'));
            const relDesktop = path.relative(outputDir, desktopFile);
            nodeScreenshots.desktop = relDesktop;
            validScreenshots.push({
              screenId,
              route: concretePath,
              viewport: 'desktop',
              filePath: relDesktop,
              width: 1280,
              height: 800,
            });
          } catch {}
        }

        // Tablet Viewport Capture (768x1024)
        await engine.switchViewport(page, 'tablet');
        await page.waitForTimeout(100);
        let tabletShot = '';
        try {
          tabletShot = await captureWebPScreenshot(page);
        } catch {
          try {
            const buf = await page.screenshot({ type: 'png' });
            tabletShot = buf.toString('base64');
          } catch {}
        }
        const tabletFile = path.join(screenshotsDir, `tablet_${screenSlug}.webp`);
        if (tabletShot) {
          try {
            await fs.promises.writeFile(tabletFile, Buffer.from(tabletShot, 'base64'));
            const relTablet = path.relative(outputDir, tabletFile);
            nodeScreenshots.tablet = relTablet;
            validScreenshots.push({
              screenId,
              route: concretePath,
              viewport: 'tablet',
              filePath: relTablet,
              width: 768,
              height: 1024,
            });
          } catch {}
        }

        // Mobile Viewport Capture (390x844)
        await engine.switchViewport(page, 'mobile');
        await page.waitForTimeout(100);
        let mobileShot = '';
        try {
          mobileShot = await captureWebPScreenshot(page);
        } catch {
          try {
            const buf = await page.screenshot({ type: 'png' });
            mobileShot = buf.toString('base64');
          } catch {}
        }
        const mobileFile = path.join(screenshotsDir, `mobile_${screenSlug}.webp`);
        if (mobileShot) {
          try {
            await fs.promises.writeFile(mobileFile, Buffer.from(mobileShot, 'base64'));
            const relMobile = path.relative(outputDir, mobileFile);
            nodeScreenshots.mobile = relMobile;
            validScreenshots.push({
              screenId,
              route: concretePath,
              viewport: 'mobile',
              filePath: relMobile,
              width: 390,
              height: 844,
            });
          } catch {}
        }

        // Switch back to Desktop for safe affordance probing
        await engine.switchViewport(page, 'desktop');
        await page.waitForTimeout(50);

        // Record Journey Video Session Marker
        let marker: RouteMarker | undefined;
        if (recorder) {
          const ended = recorder.endSession(screenId);
          if (ended) {
            marker = ended;
            manifestBuilder.addVideoMarker(marker);
          }
        }

        // Affordance & Modal Probing
        const { affordances } = await prober.probeRoute(
          page,
          concretePath,
          graphBuilder,
          { timeoutMs: 3000, useJev: true }
        );

        // Link transitions into graph builder
        for (const aff of affordances) {
          if (aff.type === 'link' && aff.target) {
            let targetPath = aff.target;
            if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
              try {
                targetPath = new URL(targetPath).pathname;
              } catch {}
            }
            if (targetPath && targetPath !== concretePath) {
              const targetNodeId = `route:${targetPath}`;
              graphBuilder.addTransition({
                id: `${baseNodeId}->${targetNodeId}:link`,
                sourceNodeId: baseNodeId,
                targetNodeId: targetNodeId,
                triggerType: 'link',
                triggerText: aff.text || targetPath,
                triggerSelector: aff.selector,
              });
            }
          }
        }

        // Add/Update Screen Node in GraphBuilder
        const pageTitle = (await page.title().catch(() => '')) || routeNode.rawPath || concretePath;
        const screenFlowNode: FlowNode = {
          id: baseNodeId,
          type: 'route',
          path: concretePath,
          title: pageTitle,
          sourceFilePath: routeNode.filePath,
          authRequired: routeNode.authRequired,
          screenshots: nodeScreenshots,
          videoSlice: marker
            ? {
                start: marker.relativeStartSec,
                end: marker.relativeEndSec,
              }
            : undefined,
        };
        graphBuilder.addNode(screenFlowNode);

        // Record Screenshots in Manifest only when non-empty and written to disk
        if (validScreenshots.length > 0) {
          manifestBuilder.addScreenshots(validScreenshots);
        }
      }
    }

    // Video Capture Teardown & File Relocation
    const videoObj = page.video();
    await page.close();

    if (videoObj) {
      try {
        const rawVideoPath = await videoObj.path();
        if (rawVideoPath && fs.existsSync(rawVideoPath)) {
          const destVideoPath = path.join(outputDir, 'journey.webm');
          await fs.promises.copyFile(rawVideoPath, destVideoPath);
          finalVideoPath = destVideoPath;
        }
      } catch {
        // Video file might already be closed or unavailable
      }
    }
  } finally {
    // 6. Clean Teardown
    await engine.stop();
    if (spawnedServer) {
      try {
        await spawnedServer.stop();
      } catch {}
    }
  }

  // 5. Graph & Manifest Compilation
  const markers = recorder ? recorder.getMarkers() : [];
  if (finalVideoPath) {
    manifestBuilder.setVideoMetadata({
      filePath: path.relative(outputDir, finalVideoPath),
      fileName: 'journey.webm',
      markers,
      durationMs: Date.now() - startTime,
    });
  }

  const graph = graphBuilder.toJSON();
  const manifest = manifestBuilder.build();

  const manifestPath = path.join(outputDir, 'flow-manifest.json');
  await manifestBuilder.writeToFile(manifestPath);

  options.onProgress?.('Generating interactive wireframe board and flow graph artifacts...');
  const boardEmitter = new WireframeBoardEmitter();
  const { htmlPath, jsonPath } = await boardEmitter.emitToDisk(outputDir, graph, {
    title: `${path.basename(projectRoot)} Wireframe Flow Board`,
    videoFileName: finalVideoPath ? 'journey.webm' : undefined,
    videoMarkers: markers,
    standalone: options.standalone ?? true,
  });

  const durationMs = Date.now() - startTime;
  options.onProgress?.(`Wireframe crawl completed in ${durationMs}ms (total screens: ${graph.nodes.length})`);

  return {
    graph,
    manifest,
    htmlPath,
    jsonPath,
    videoPath: finalVideoPath,
    markers,
    totalScreens: graph.nodes.length,
    durationMs,
  };
}
