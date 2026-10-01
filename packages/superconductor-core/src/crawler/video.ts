import type { RouteMarker } from './types.js';

export interface JourneyVideoRecorderOptions {
  videoOutputDir?: string;
  videoSize?: {
    width: number;
    height: number;
  };
  baseStartTimeMs?: number;
}

interface ActiveSession {
  screenId: string;
  route: string;
  action: string;
  viewport: string;
  startTimeMs: number;
}

/**
 * JourneyVideoRecorder coordinates continuous browser journey video capture
 * and millisecond-accurate route marker boundary logging.
 */
export class JourneyVideoRecorder {
  private readonly videoOutputDir: string;
  private readonly videoSize: { width: number; height: number };
  private baseStartTimeMs?: number;
  private readonly initialBaseStartTimeMs?: number;
  private readonly activeSessions: Map<string, ActiveSession> = new Map();
  private readonly markers: RouteMarker[] = [];

  constructor(options: JourneyVideoRecorderOptions = {}) {
    this.videoOutputDir = options.videoOutputDir || './recordings';
    this.videoSize = options.videoSize || { width: 1280, height: 800 };
    this.initialBaseStartTimeMs = options.baseStartTimeMs;
    this.baseStartTimeMs = options.baseStartTimeMs;
  }

  /**
   * Returns standard Playwright browser context video recording options.
   * Playwright option format:
   * recordVideo: { dir: videoOutputDir, size: { width: 1280, height: 800 } }
   */
  getRecordVideoOptions(): { dir: string; size: { width: number; height: number } } {
    return {
      dir: this.videoOutputDir,
      size: { ...this.videoSize },
    };
  }

  /**
   * Returns context options object ready to pass to `browser.newContext(...)`.
   */
  getContextOptions(): { recordVideo: { dir: string; size: { width: number; height: number } } } {
    return {
      recordVideo: this.getRecordVideoOptions(),
    };
  }

  /**
   * Merges video recording parameters into an existing Playwright context options dictionary.
   */
  applyToBrowserContextOptions<T extends object>(
    options: T = {} as T
  ): T & { recordVideo: { dir: string; size: { width: number; height: number } } } {
    return {
      ...options,
      recordVideo: this.getRecordVideoOptions(),
    };
  }

  /**
   * Starts a recording interval for a specific screen/route transition.
   * Logs start timestamp in milliseconds.
   */
  startSession(
    screenId: string,
    route: string,
    action: string,
    viewport = 'desktop',
    startTimeMs?: number
  ): void {
    const now = startTimeMs ?? Date.now();

    if (this.baseStartTimeMs === undefined) {
      this.baseStartTimeMs = now;
    }

    this.activeSessions.set(screenId, {
      screenId,
      route,
      action,
      viewport,
      startTimeMs: now,
    });
  }

  /**
   * Ends the recording interval for the specified screenId.
   * Calculates relative start and end time in seconds, and adds to markers list.
   */
  endSession(screenId: string, endTimeMs?: number): RouteMarker {
    const session = this.activeSessions.get(screenId);
    if (!session) {
      throw new Error(`No active recording session found for screenId: "${screenId}".`);
    }

    const end = endTimeMs ?? Date.now();
    const base = this.baseStartTimeMs ?? session.startTimeMs;

    const relativeStartSec = Math.max(0, Math.round(session.startTimeMs - base) / 1000);
    const relativeEndSec = Math.max(relativeStartSec, Math.round(end - base) / 1000);

    const marker: RouteMarker = {
      screenId: session.screenId,
      route: session.route,
      action: session.action,
      viewport: session.viewport,
      startTimeMs: session.startTimeMs,
      endTimeMs: end,
      relativeStartSec,
      relativeEndSec,
    };

    this.activeSessions.delete(screenId);
    this.markers.push(marker);

    return marker;
  }

  /**
   * Returns a chronological copy of all completed route markers.
   */
  getMarkers(): RouteMarker[] {
    return [...this.markers];
  }

  /**
   * Retrieves a specific marker by screenId.
   */
  getMarker(screenId: string): RouteMarker | undefined {
    return this.markers.find((m) => m.screenId === screenId);
  }

  /**
   * Generates a W3C HTML5 media fragment URL for embedding and looping:
   * Returns `#t=${marker.relativeStartSec},${marker.relativeEndSec}` (or prefixed by videoFileName).
   */
  generateMediaFragmentUri(videoFileName: string, screenId: string): string {
    const marker = this.getMarker(screenId);
    if (!marker) {
      throw new Error(`Marker not found for screenId: "${screenId}".`);
    }

    const fragment = `#t=${marker.relativeStartSec},${marker.relativeEndSec}`;
    return videoFileName ? `${videoFileName}${fragment}` : fragment;
  }

  /**
   * Resets recorder state.
   */
  reset(): void {
    this.activeSessions.clear();
    this.markers.length = 0;
    this.baseStartTimeMs = this.initialBaseStartTimeMs;
  }
}
