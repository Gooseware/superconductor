import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { JourneyVideoRecorder } from '../../src/crawler/video.js';
import { ManifestBuilder } from '../../src/crawler/manifest.js';
import type { RouteMarker } from '../../src/crawler/types.js';

describe('JourneyVideoRecorder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-video-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Playwright browser context options', () => {
    it('provides standard Playwright video recording options with default 1280x800 resolution', () => {
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
      });

      const options = recorder.getRecordVideoOptions();
      expect(options).toEqual({
        dir: tempDir,
        size: { width: 1280, height: 800 },
      });

      const contextOptions = recorder.getContextOptions();
      expect(contextOptions).toEqual({
        recordVideo: {
          dir: tempDir,
          size: { width: 1280, height: 800 },
        },
      });
    });

    it('allows custom resolution in video options', () => {
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
        videoSize: { width: 1920, height: 1080 },
      });

      expect(recorder.getRecordVideoOptions()).toEqual({
        dir: tempDir,
        size: { width: 1920, height: 1080 },
      });
    });
  });

  describe('Marker tracking & interval calculation', () => {
    it('tracks chronological route markers with millisecond and relative-second intervals', () => {
      const baseTime = 1000000;
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
        baseStartTimeMs: baseTime,
      });

      // Session 1: Home page initial render
      recorder.startSession('screen-home', '/', 'render', 'desktop', baseTime);
      recorder.endSession('screen-home', baseTime + 1500);

      // Session 2: Navigate to dashboard
      recorder.startSession('screen-dash', '/dashboard', 'navigate', 'desktop', baseTime + 1500);
      recorder.endSession('screen-dash', baseTime + 4200);

      // Session 3: Open settings modal on mobile
      recorder.startSession('screen-settings-modal', '/dashboard#settings', 'click:open_settings', 'mobile', baseTime + 4200);
      recorder.endSession('screen-settings-modal', baseTime + 6000);

      const markers = recorder.getMarkers();
      expect(markers).toHaveLength(3);

      expect(markers[0]).toEqual({
        screenId: 'screen-home',
        route: '/',
        action: 'render',
        viewport: 'desktop',
        startTimeMs: baseTime,
        endTimeMs: baseTime + 1500,
        relativeStartSec: 0,
        relativeEndSec: 1.5,
      });

      expect(markers[1]).toEqual({
        screenId: 'screen-dash',
        route: '/dashboard',
        action: 'navigate',
        viewport: 'desktop',
        startTimeMs: baseTime + 1500,
        endTimeMs: baseTime + 4200,
        relativeStartSec: 1.5,
        relativeEndSec: 4.2,
      });

      expect(markers[2]).toEqual({
        screenId: 'screen-settings-modal',
        route: '/dashboard#settings',
        action: 'click:open_settings',
        viewport: 'mobile',
        startTimeMs: baseTime + 4200,
        endTimeMs: baseTime + 6000,
        relativeStartSec: 4.2,
        relativeEndSec: 6,
      });
    });

    it('defaults viewport to desktop if omitted', () => {
      const baseTime = 2000000;
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
        baseStartTimeMs: baseTime,
      });

      recorder.startSession('screen-1', '/about', 'render', undefined, baseTime);
      recorder.endSession('screen-1', baseTime + 2000);

      const markers = recorder.getMarkers();
      expect(markers[0].viewport).toBe('desktop');
    });

    it('automatically uses first startSession timestamp as baseStartTimeMs if not specified', () => {
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
      });

      const t0 = 5000000;
      recorder.startSession('screen-init', '/init', 'load', 'desktop', t0);
      recorder.endSession('screen-init', t0 + 2500);

      const markers = recorder.getMarkers();
      expect(markers[0].relativeStartSec).toBe(0);
      expect(markers[0].relativeEndSec).toBe(2.5);
    });

    it('throws when endSession is called with unknown screenId', () => {
      const recorder = new JourneyVideoRecorder({ videoOutputDir: tempDir });
      expect(() => recorder.endSession('non-existent')).toThrow(/no active recording session/i);
    });
  });

  describe('generateMediaFragmentUri', () => {
    it('generates accurate W3C HTML5 media fragment URI for looping and video playback', () => {
      const baseTime = 1000000;
      const recorder = new JourneyVideoRecorder({
        videoOutputDir: tempDir,
        baseStartTimeMs: baseTime,
      });

      recorder.startSession('screen-landing', '/landing', 'render', 'desktop', baseTime + 1200);
      recorder.endSession('screen-landing', baseTime + 3800);

      const uriWithFile = recorder.generateMediaFragmentUri('journey.webm', 'screen-landing');
      expect(uriWithFile).toBe('journey.webm#t=1.2,3.8');

      const uriWithoutFile = recorder.generateMediaFragmentUri('', 'screen-landing');
      expect(uriWithoutFile).toBe('#t=1.2,3.8');
    });

    it('throws if screenId does not exist when generating media fragment URI', () => {
      const recorder = new JourneyVideoRecorder({ videoOutputDir: tempDir });
      expect(() => recorder.generateMediaFragmentUri('video.webm', 'missing')).toThrow(/marker not found/i);
    });
  });
});

describe('ManifestBuilder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-manifest-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('compiles full journey manifest combining route AST metadata, screenshots, video markers, and interaction events', () => {
    const builder = new ManifestBuilder({
      appRoot: '/app',
      framework: 'react-router',
    });

    // 1. Add Route AST metadata
    builder.addRoute({
      path: '/',
      rawPath: '/',
      filePath: 'src/routes/home.tsx',
      isIndex: true,
      dynamicParams: [],
      authRequired: false,
      authGuards: [],
      sourceLocation: { filePath: 'src/routes/home.tsx', line: 1 },
    });
    builder.addRoute({
      path: '/profile/:userId',
      rawPath: '/profile/:userId',
      filePath: 'src/routes/profile.tsx',
      isIndex: false,
      dynamicParams: ['userId'],
      authRequired: true,
      authGuards: ['requireAuth'],
      sourceLocation: { filePath: 'src/routes/profile.tsx', line: 1 },
    });

    // 2. Add screenshots across viewports
    builder.addScreenshot({
      screenId: 'screen-home',
      route: '/',
      viewport: 'desktop',
      filePath: 'screenshots/home-desktop.webp',
      width: 1280,
      height: 800,
    });
    builder.addScreenshot({
      screenId: 'screen-home',
      route: '/',
      viewport: 'tablet',
      filePath: 'screenshots/home-tablet.webp',
      width: 768,
      height: 1024,
    });
    builder.addScreenshot({
      screenId: 'screen-home',
      route: '/',
      viewport: 'mobile',
      filePath: 'screenshots/home-mobile.webp',
      width: 390,
      height: 844,
    });

    // 3. Add video markers
    const homeMarker: RouteMarker = {
      screenId: 'screen-home',
      route: '/',
      action: 'render',
      viewport: 'desktop',
      startTimeMs: 1000,
      endTimeMs: 2500,
      relativeStartSec: 0,
      relativeEndSec: 1.5,
    };
    builder.addVideoMarker(homeMarker);

    // 4. Add interaction events
    builder.addInteraction({
      screenId: 'screen-home',
      target: 'button#open-menu',
      action: 'click',
      timestampMs: 1800,
      metadata: { text: 'Menu' },
    });

    // 5. Video metadata
    builder.setVideoMetadata({
      fileName: 'journey.webm',
      filePath: 'videos/journey.webm',
      durationMs: 2500,
    });

    const manifest = builder.build();

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.framework).toBe('react-router');
    expect(manifest.appRoot).toBe('/app');
    expect(manifest.routes).toHaveLength(2);
    expect(manifest.screenshots).toHaveLength(3);
    expect(manifest.videoMarkers).toHaveLength(1);
    expect(manifest.interactions).toHaveLength(1);
    expect(manifest.video?.fileName).toBe('journey.webm');

    // Verify screen nodes are aggregated
    const homeScreen = manifest.screens.find((s) => s.screenId === 'screen-home');
    expect(homeScreen).toBeDefined();
    expect(homeScreen?.screenshots.desktop).toBe('screenshots/home-desktop.webp');
    expect(homeScreen?.screenshots.tablet).toBe('screenshots/home-tablet.webp');
    expect(homeScreen?.screenshots.mobile).toBe('screenshots/home-mobile.webp');
    expect(homeScreen?.videoMarker).toEqual(homeMarker);
    expect(homeScreen?.interactions).toHaveLength(1);
  });

  it('serializes to and deserializes from flow-manifest.json', async () => {
    const builder = new ManifestBuilder({
      appRoot: '/workspace/project',
      framework: 'nextjs',
    });

    builder.addRoute({
      path: '/dashboard',
      rawPath: '/dashboard',
      filePath: 'app/dashboard/page.tsx',
      isIndex: false,
      dynamicParams: [],
      authRequired: true,
      authGuards: ['auth-middleware'],
      sourceLocation: { filePath: 'app/dashboard/page.tsx', line: 5 },
    });

    builder.addVideoMarker({
      screenId: 'screen-dash',
      route: '/dashboard',
      action: 'visit',
      viewport: 'desktop',
      startTimeMs: 1000,
      endTimeMs: 4000,
      relativeStartSec: 0,
      relativeEndSec: 3.0,
    });

    const targetJsonPath = path.join(tempDir, 'flow-manifest.json');
    await builder.writeToFile(targetJsonPath);

    expect(fs.existsSync(targetJsonPath)).toBe(true);

    const loadedManifest = await ManifestBuilder.loadFromFile(targetJsonPath);
    expect(loadedManifest.framework).toBe('nextjs');
    expect(loadedManifest.appRoot).toBe('/workspace/project');
    expect(loadedManifest.routes[0].path).toBe('/dashboard');
    expect(loadedManifest.videoMarkers[0].screenId).toBe('screen-dash');
    expect(loadedManifest.videoMarkers[0].relativeEndSec).toBe(3.0);

    // Verify string serialization/deserialization directly
    const jsonString = builder.serialize();
    const deserialized = ManifestBuilder.deserialize(jsonString);
    expect(deserialized).toEqual(builder.build());
  });
});
