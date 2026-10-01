export interface RouteManifestNode {
  path: string;
  rawPath: string;
  filePath: string;
  layoutFilePath?: string;
  isIndex: boolean;
  dynamicParams: string[];
  authRequired: boolean;
  authGuards: string[];
  sourceLocation: {
    filePath: string;
    line: number;
  };
}

export type ViewportName = 'desktop' | 'tablet' | 'mobile';

export interface ViewportPreset {
  name: ViewportName;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export interface CrawlerConfig {
  projectRoot: string;
  baseUrl?: string;
  routesFile?: string;
  viewports: ViewportPreset[];
  outputDir: string;
  maxConcretePerParam: number;
  timeoutMs: number;
  chromiumPath?: string;
}

export interface RouteMarker {
  screenId: string;
  route: string;
  startTimeMs: number;
  endTimeMs: number;
  relativeStartSec: number;
  relativeEndSec: number;
  action: string;
  viewport: string;
}

export interface ScreenshotMetadata {
  screenId: string;
  route: string;
  viewport: ViewportName | string;
  filePath: string;
  width: number;
  height: number;
  timestampMs?: number;
}

export interface InteractionEvent {
  screenId: string;
  target: string;
  action: string;
  timestampMs: number;
  metadata?: Record<string, any>;
}

export interface ScreenNode {
  screenId: string;
  route: string;
  title?: string;
  astMetadata?: RouteManifestNode;
  screenshots: {
    desktop?: string;
    tablet?: string;
    mobile?: string;
    [viewport: string]: string | undefined;
  };
  videoMarker?: RouteMarker;
  interactions: InteractionEvent[];
}

export interface JourneyVideoMetadata {
  filePath?: string;
  fileName?: string;
  durationMs?: number;
  markers?: RouteMarker[];
}

export interface FlowManifest {
  version: string;
  generatedAt: string;
  appRoot?: string;
  framework?: SupportedFramework | string;
  routes: RouteManifestNode[];
  screens: ScreenNode[];
  videoMarkers: RouteMarker[];
  screenshots: ScreenshotMetadata[];
  interactions: InteractionEvent[];
  video?: JourneyVideoMetadata;
}

export interface FlowNode {
  id: string;
  type: 'route' | 'modal' | 'drawer';
  path: string;
  title: string;
  sourceFilePath: string;
  authRequired: boolean;
  screenshots: Record<string, string>;
  videoSlice?: {
    start: number;
    end: number;
  };
}

export interface FlowTransition {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  triggerType: 'link' | 'modal_trigger' | 'drawer_trigger';
  triggerText: string;
  triggerSelector: string;
}

export interface UserFlowGraph {
  nodes: FlowNode[];
  transitions: FlowTransition[];
  rootNodeId: string;
}

export type SupportedFramework = 'react-router' | 'remix' | 'nextjs' | 'vite';

export interface RouteManifest {
  framework: SupportedFramework | 'unknown';
  routes: RouteManifestNode[];
}

export interface ParseOptions {
  projectRoot: string;
  framework?: SupportedFramework | 'auto';
  routesFile?: string;
  inspectAuth?: boolean;
}

export interface AuthInspectionResult {
  authRequired: boolean;
  authGuards: string[];
}

export type AffordanceType = 'link' | 'modal_trigger' | 'drawer_trigger';

export interface DiscoveredAffordance {
  type: AffordanceType;
  selector: string;
  text: string;
  target?: string;
  ariaLabel?: string;
  elementHtml?: string;
  actionId?: string;
  nodeId?: number;
  rect?: { x: number; y: number; w: number; h: number };
  role?: string;
}

export interface BlockedMutation {
  url: string;
  method: string;
  timestamp: number;
}

export interface RankedFlowNode extends FlowNode {
  rank: number;
  node: FlowNode;
}
