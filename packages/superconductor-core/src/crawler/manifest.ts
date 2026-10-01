import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FlowManifest,
  RouteManifestNode,
  RouteMarker,
  ScreenshotMetadata,
  InteractionEvent,
  ScreenNode,
  JourneyVideoMetadata,
  SupportedFramework,
} from './types.js';

export interface ManifestBuilderOptions {
  version?: string;
  appRoot?: string;
  framework?: SupportedFramework | string;
  generatedAt?: string;
}

/**
 * ManifestBuilder compiles the full journey manifest combining route AST metadata,
 * multi-viewport screenshots (Desktop, Tablet, Mobile), video markers, and interaction events.
 * It provides methods to serialize to and deserialize from `flow-manifest.json`.
 */
export class ManifestBuilder {
  private version: string;
  private appRoot?: string;
  private framework?: SupportedFramework | string;
  private generatedAt?: string;
  private readonly routes: RouteManifestNode[] = [];
  private readonly screenshots: ScreenshotMetadata[] = [];
  private readonly videoMarkers: RouteMarker[] = [];
  private readonly interactions: InteractionEvent[] = [];
  private videoMetadata?: JourneyVideoMetadata;

  constructor(options: ManifestBuilderOptions = {}) {
    this.version = options.version || '1.0.0';
    this.appRoot = options.appRoot;
    this.framework = options.framework;
    this.generatedAt = options.generatedAt;
  }

  /**
   * Adds a single parsed route AST node.
   */
  addRoute(route: RouteManifestNode): this {
    this.routes.push(route);
    return this;
  }

  /**
   * Adds multiple parsed route AST nodes.
   */
  addRoutes(routes: RouteManifestNode[]): this {
    this.routes.push(...routes);
    return this;
  }

  /**
   * Adds a viewport screenshot record.
   */
  addScreenshot(screenshot: ScreenshotMetadata): this {
    this.screenshots.push(screenshot);
    return this;
  }

  /**
   * Adds multiple viewport screenshot records.
   */
  addScreenshots(screenshots: ScreenshotMetadata[]): this {
    this.screenshots.push(...screenshots);
    return this;
  }

  /**
   * Adds a journey video marker.
   */
  addVideoMarker(marker: RouteMarker): this {
    this.videoMarkers.push(marker);
    return this;
  }

  /**
   * Adds multiple journey video markers.
   */
  addVideoMarkers(markers: RouteMarker[]): this {
    this.videoMarkers.push(...markers);
    return this;
  }

  /**
   * Adds a recorded interaction event.
   */
  addInteraction(interaction: InteractionEvent): this {
    this.interactions.push(interaction);
    return this;
  }

  /**
   * Adds multiple recorded interaction events.
   */
  addInteractions(interactions: InteractionEvent[]): this {
    this.interactions.push(...interactions);
    return this;
  }

  /**
   * Sets top-level video metadata.
   */
  setVideoMetadata(video: JourneyVideoMetadata): this {
    this.videoMetadata = video;
    return this;
  }

  /**
   * Compiles and returns the unified FlowManifest object.
   */
  build(): FlowManifest {
    // Aggregate screen nodes across screenshots, markers, and interactions
    const screenMap = new Map<string, ScreenNode>();

    const getOrCreateScreen = (screenId: string, routeHint = ''): ScreenNode => {
      let screen = screenMap.get(screenId);
      if (!screen) {
        screen = {
          screenId,
          route: routeHint,
          screenshots: {},
          interactions: [],
        };
        screenMap.set(screenId, screen);
      } else if (!screen.route && routeHint) {
        screen.route = routeHint;
      }
      return screen;
    };

    // 1. Process video markers
    for (const marker of this.videoMarkers) {
      const screen = getOrCreateScreen(marker.screenId, marker.route);
      screen.videoMarker = marker;
      if (!screen.route) {
        screen.route = marker.route;
      }
    }

    // 2. Process screenshots
    for (const screenshot of this.screenshots) {
      const screen = getOrCreateScreen(screenshot.screenId, screenshot.route);
      if (screenshot.viewport === 'desktop') {
        screen.screenshots.desktop = screenshot.filePath;
      } else if (screenshot.viewport === 'tablet') {
        screen.screenshots.tablet = screenshot.filePath;
      } else if (screenshot.viewport === 'mobile') {
        screen.screenshots.mobile = screenshot.filePath;
      } else {
        screen.screenshots[screenshot.viewport] = screenshot.filePath;
      }
    }

    // 3. Process interactions
    for (const interaction of this.interactions) {
      const screen = getOrCreateScreen(interaction.screenId);
      screen.interactions.push(interaction);
    }

    // 4. Attach matching route AST metadata if route path matches
    for (const screen of screenMap.values()) {
      if (screen.route) {
        const cleanPath = screen.route.split('#')[0].split('?')[0];
        const matchingAst = this.routes.find(
          (r) => r.path === cleanPath || r.rawPath === cleanPath
        );
        if (matchingAst) {
          screen.astMetadata = matchingAst;
        }
      }
    }

    const screens = Array.from(screenMap.values());

    const generatedAt = this.generatedAt ?? new Date().toISOString();
    this.generatedAt = generatedAt;

    const manifest: FlowManifest = {
      version: this.version,
      generatedAt,
      appRoot: this.appRoot,
      framework: this.framework,
      routes: [...this.routes],
      screens,
      videoMarkers: [...this.videoMarkers],
      screenshots: [...this.screenshots],
      interactions: [...this.interactions],
    };

    if (this.videoMetadata) {
      manifest.video = {
        ...this.videoMetadata,
        markers: this.videoMetadata.markers ?? [...this.videoMarkers],
      };
    }

    return manifest;
  }

  /**
   * Serializes the compiled manifest to JSON string format.
   */
  serialize(indent = 2): string {
    return JSON.stringify(this.build(), null, indent);
  }

  /**
   * Writes the serialized manifest directly to disk at the specified path (default: flow-manifest.json).
   */
  async writeToFile(outputPath = 'flow-manifest.json', indent = 2): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const json = this.serialize(indent);
    await fs.promises.writeFile(outputPath, json, 'utf-8');
  }

  /**
   * Deserializes a raw JSON string into a FlowManifest object.
   */
  static deserialize(jsonString: string): FlowManifest {
    return JSON.parse(jsonString) as FlowManifest;
  }

  /**
   * Loads and parses a FlowManifest JSON file from disk.
   */
  static async loadFromFile(filePath: string): Promise<FlowManifest> {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return ManifestBuilder.deserialize(raw);
  }

  /**
   * Creates a ManifestBuilder prepopulated from an existing FlowManifest.
   */
  static from(manifest: FlowManifest): ManifestBuilder {
    const builder = new ManifestBuilder({
      version: manifest.version,
      appRoot: manifest.appRoot,
      framework: manifest.framework,
    });

    if (manifest.routes) builder.addRoutes(manifest.routes);
    if (manifest.screenshots) builder.addScreenshots(manifest.screenshots);
    if (manifest.videoMarkers) builder.addVideoMarkers(manifest.videoMarkers);
    if (manifest.interactions) builder.addInteractions(manifest.interactions);
    if (manifest.video) builder.setVideoMetadata(manifest.video);

    return builder;
  }
}
