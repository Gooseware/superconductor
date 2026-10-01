import { z } from 'zod';

export interface ViewSnapshot {
  id: string;
  title: string;
  sourceType: 'web_component' | 'web_page' | 'terminal_cli' | 'static_image';
  filePath: string;
  entryPoint?: string;
  route?: string;
  terminalCommand?: string;
  dimensions?: { width: number; height: number };
  annotations?: SpatialAnnotation[];
}

export interface SpatialAnnotation {
  id: string;
  viewId: string;
  type: 'pin' | 'bounding_box';
  selector?: string;
  xpath?: string;
  sourceLocation?: {
    filePath: string;
    componentName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  geometry: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  author: string;
  comment: string;
  tags: string[];
  severity?: 'blocker' | 'enhancement' | 'refactor' | 'nitpick';
  createdAt: string;
}

export interface ProposalPatch {
  id: string;
  title: string;
  targetFilePath: string;
  jsxReplacement?: string;
  cssDelta?: string;
  injectedProps?: Record<string, unknown>;
}

export interface PreviewInstance {
  viewId: string;
  url: string;
  destroy(): Promise<void>;
}

export interface SurfaceAdapter {
  readonly name: string;
  detect(projectRoot: string): Promise<boolean>;
  discoverViews(projectRoot: string): Promise<ViewSnapshot[]>;
  mountPreview(viewId: string, container?: HTMLElement): Promise<PreviewInstance>;
}

// Zod Validation Schemas
export const SpatialAnnotationSchema = z.object({
  id: z.string().min(1),
  viewId: z.string().min(1),
  type: z.enum(['pin', 'bounding_box']),
  selector: z.string().optional(),
  xpath: z.string().optional(),
  sourceLocation: z.object({
    filePath: z.string(),
    componentName: z.string().optional(),
    lineNumber: z.number().int().positive().optional(),
    columnNumber: z.number().int().positive().optional(),
  }).optional(),
  geometry: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  }),
  author: z.string(),
  comment: z.string(),
  tags: z.array(z.string()),
  severity: z.enum(['blocker', 'enhancement', 'refactor', 'nitpick']).optional(),
  createdAt: z.string(),
});

export const ViewSnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceType: z.enum(['web_component', 'web_page', 'terminal_cli', 'static_image']),
  filePath: z.string(),
  entryPoint: z.string().optional(),
  route: z.string().optional(),
  terminalCommand: z.string().optional(),
  dimensions: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  annotations: z.array(SpatialAnnotationSchema).optional(),
});

export const ProposalPatchSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  targetFilePath: z.string(),
  jsxReplacement: z.string().optional(),
  cssDelta: z.string().optional(),
  injectedProps: z.record(z.unknown()).optional(),
});

// Validation Functions
export function validateViewSnapshot(data: unknown): ViewSnapshot {
  return ViewSnapshotSchema.parse(data) as ViewSnapshot;
}

export function validateSpatialAnnotation(data: unknown): SpatialAnnotation {
  return SpatialAnnotationSchema.parse(data) as SpatialAnnotation;
}

export function validateProposalPatch(data: unknown): ProposalPatch {
  return ProposalPatchSchema.parse(data) as ProposalPatch;
}

// Serialization / Deserialization
export function serializeViewSnapshot(snapshot: ViewSnapshot): string {
  validateViewSnapshot(snapshot);
  return JSON.stringify(snapshot, null, 2);
}

export function deserializeViewSnapshot(json: string): ViewSnapshot {
  const parsed = JSON.parse(json);
  return validateViewSnapshot(parsed);
}

export function serializeSpatialAnnotation(annotation: SpatialAnnotation): string {
  validateSpatialAnnotation(annotation);
  return JSON.stringify(annotation, null, 2);
}

export function deserializeSpatialAnnotation(json: string): SpatialAnnotation {
  const parsed = JSON.parse(json);
  return validateSpatialAnnotation(parsed);
}

export function serializeProposalPatch(patch: ProposalPatch): string {
  validateProposalPatch(patch);
  return JSON.stringify(patch, null, 2);
}

export function deserializeProposalPatch(json: string): ProposalPatch {
  const parsed = JSON.parse(json);
  return validateProposalPatch(parsed);
}

// Abstract Base Surface Adapter
export abstract class BaseSurfaceAdapter implements SurfaceAdapter {
  abstract readonly name: string;
  abstract detect(projectRoot: string): Promise<boolean>;
  abstract discoverViews(projectRoot: string): Promise<ViewSnapshot[]>;
  abstract mountPreview(viewId: string, container?: HTMLElement): Promise<PreviewInstance>;
}

// Mock Surface Adapter for testing and reference implementation
export class MockSurfaceAdapter extends BaseSurfaceAdapter {
  readonly name: string;
  private views: Map<string, ViewSnapshot> = new Map();

  constructor(name = 'mock_surface', initialViews: ViewSnapshot[] = []) {
    super();
    this.name = name;
    for (const view of initialViews) {
      this.addView(view);
    }
  }

  addView(view: ViewSnapshot): void {
    validateViewSnapshot(view);
    this.views.set(view.id, view);
  }

  async detect(_projectRoot: string): Promise<boolean> {
    return true;
  }

  async discoverViews(_projectRoot: string): Promise<ViewSnapshot[]> {
    return Array.from(this.views.values());
  }

  async mountPreview(viewId: string, _container?: HTMLElement): Promise<PreviewInstance> {
    const view = this.views.get(viewId);
    if (!view) {
      throw new Error(`View '${viewId}' not found in ${this.name}`);
    }
    return {
      viewId,
      url: `http://localhost:5173/preview/${viewId}`,
      destroy: async () => {},
    };
  }
}
