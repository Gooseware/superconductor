import * as path from 'node:path';
import * as fs from 'node:fs';
import { SpatialAnnotation } from './surface-adapter.js';
import { ExecutionPlanner, TrackPlanData } from '../track/execution-planner.js';

export type LayerLevel = 0 | 1 | 2 | 3;
export type LayerName = 'tokens' | 'components' | 'views' | 'workflows';

/**
 * Representation of a track candidate clustered from spatial annotations.
 * Implements TrackPlanData so it can be passed directly to ExecutionPlanner.planWaves.
 */
export interface ClusteredTrackCandidate extends TrackPlanData {
  trackId: string;
  title: string;
  description: string;
  layer: LayerLevel;
  layerName: LayerName;
  annotations: SpatialAnnotation[];
  dependsOn: string[];
  dependencies: string[]; // identical to dependsOn for TrackPlanData compatibility
  benefitScore: number;
  targetFiles: string[];
  affectedComponents: string[];
  viewIds: string[];
  domain: string;
  tier: number;
  tcs: number;
  metadata?: Record<string, unknown>;
}

export interface LayeredAssemblyOptions {
  customSharedComponents?: string[];
  idPrefix?: string;
  defaultDomain?: string;
  tokenTrackId?: string;
}

const DEFAULT_SHARED_COMPONENTS = new Set([
  'button',
  'iconbutton',
  'buttongroup',
  'navbar',
  'nav',
  'navigation',
  'header',
  'footer',
  'sidebar',
  'appshell',
  'modal',
  'dialog',
  'drawer',
  'sheet',
  'popover',
  'tooltip',
  'input',
  'textinput',
  'forminput',
  'select',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'textarea',
  'card',
  'avatar',
  'badge',
  'tag',
  'chip',
  'toast',
  'alert',
  'banner',
  'spinner',
  'progress',
  'skeleton',
  'table',
  'datatable',
  'pagination',
  'tabs',
  'breadcrumb',
  'menu',
  'dropdown',
  'accordion',
]);

const TOKEN_TAG_PATTERNS = [
  'token',
  'tokens',
  'theme',
  'theming',
  'design-system',
  'design_system',
  'designsystem',
  'color',
  'colors',
  'typography',
  'font',
  'spacing',
  'radius',
];

const WORKFLOW_TAG_PATTERNS = [
  'workflow',
  'workflows',
  'e2e',
  'integration',
  'journey',
  'flow',
  'multi-view',
  'multiview',
];

const SEVERITY_WEIGHTS: Record<string, number> = {
  blocker: 10,
  enhancement: 5,
  refactor: 3,
  nitpick: 1,
};

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * LayeredAssemblyEngine
 * 
 * Implements ADR 0003 (Layered Assembly Partitioning):
 * Organizes visual feedback notes into an architectural hierarchy of editing:
 * - Layer 0 (Foundational Tokens): #token, #theme, #design-system
 * - Layer 1 (Shared Golden Components): atoms & molecules (Button, Navbar, Dialogs, etc.)
 * - Layer 2 (Downstream Views / Features): view/screen workflows declaring dependencies on Layer 0 & 1
 * - Layer 3 (Cross-Screen Workflows / E2E): multi-view user journeys declaring dependencies on Layers 0, 1, 2
 * 
 * Generates topological DAG dependency edges suitable for ExecutionPlanner.planWaves.
 */
export class LayeredAssemblyEngine {
  private readonly customSharedComponents: Set<string>;
  private readonly idPrefix: string;
  private readonly defaultDomain: string;
  private readonly tokenTrackId?: string;

  constructor(options?: LayeredAssemblyOptions) {
    this.customSharedComponents = new Set(
      (options?.customSharedComponents || []).map((c) => c.toLowerCase().trim())
    );
    this.idPrefix = options?.idPrefix ? sanitizeSlug(options.idPrefix) : 'visual';
    this.defaultDomain = options?.defaultDomain || 'ui';
    this.tokenTrackId = options?.tokenTrackId ? sanitizeSlug(options.tokenTrackId) : undefined;
  }

  /**
   * Evaluates if an annotation belongs to Layer 0 (Foundational Tokens).
   */
  private isTokenAnnotation(annotation: SpatialAnnotation): boolean {
    const tags = (annotation.tags || []).map((t) => t.toLowerCase().replace(/^#/, '').trim());
    for (const tag of tags) {
      if (TOKEN_TAG_PATTERNS.includes(tag)) {
        return true;
      }
    }

    const comment = (annotation.comment || '').toLowerCase();
    if (/#(token|theme|design-system|design_system|designsystem)\b/i.test(comment)) {
      return true;
    }
    if (/\b(design token|semantic token)\b/i.test(comment)) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates if an annotation belongs to Layer 3 (Workflows / E2E Integration).
   */
  private isWorkflowAnnotation(annotation: SpatialAnnotation): boolean {
    const tags = (annotation.tags || []).map((t) => t.toLowerCase().replace(/^#/, '').trim());
    for (const tag of tags) {
      if (WORKFLOW_TAG_PATTERNS.includes(tag)) {
        return true;
      }
    }

    const comment = (annotation.comment || '').toLowerCase();
    if (/#(workflow|e2e|integration|multi-view)\b/i.test(comment)) {
      return true;
    }

    return false;
  }

  /**
   * Evaluates if an annotation belongs to Layer 1 (Shared Golden Components).
   */
  private isSharedComponentAnnotation(
    annotation: SpatialAnnotation,
    crossViewComponents: Set<string>
  ): { isShared: boolean; componentName?: string } {
    // 1. Explicit tags
    const tags = (annotation.tags || []).map((t) => t.toLowerCase().replace(/^#/, '').trim());
    const hasSharedTag = tags.some((t) =>
      ['component', 'shared', 'golden', 'atom', 'molecule', 'shared-component'].includes(t)
    );

    // 2. Component Name check
    const rawComponentName = annotation.sourceLocation?.componentName;
    if (rawComponentName) {
      const lowerName = rawComponentName.toLowerCase();
      if (
        hasSharedTag ||
        this.customSharedComponents.has(lowerName) ||
        DEFAULT_SHARED_COMPONENTS.has(lowerName) ||
        crossViewComponents.has(lowerName)
      ) {
        return { isShared: true, componentName: rawComponentName };
      }
    }

    // 3. File path check (e.g. src/components/Button.tsx)
    const filePath = annotation.sourceLocation?.filePath;
    if (filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      const isComponentPath =
        normalized.includes('/components/') ||
        normalized.includes('/ui/') ||
        normalized.includes('/shared/') ||
        normalized.includes('/atoms/') ||
        normalized.includes('/molecules/') ||
        normalized.includes('/design-system/');

      const isViewOrPage =
        normalized.includes('/views/') ||
        normalized.includes('/pages/') ||
        normalized.includes('/routes/') ||
        normalized.includes('/screens/');

      if ((isComponentPath && !isViewOrPage) || hasSharedTag) {
        const basename = path.basename(filePath, path.extname(filePath));
        return { isShared: true, componentName: rawComponentName || basename };
      }
    }

    if (hasSharedTag) {
      return { isShared: true, componentName: rawComponentName || 'SharedComponent' };
    }

    return { isShared: false };
  }

  /**
   * Computes the benefit score of a cluster based on annotation severities and count.
   */
  private calculateBenefitScore(annotations: SpatialAnnotation[], layerBonus: number = 0): number {
    let score = layerBonus;
    for (const ann of annotations) {
      const severity = ann.severity || 'enhancement';
      const weight = SEVERITY_WEIGHTS[severity] ?? 3;
      score += weight + 1; // +1 base count per annotation
    }
    return score;
  }

  /**
   * Clusters spatial annotations into layered track candidates.
   */
  public async clusterAnnotations(
    annotations: SpatialAnnotation[],
    _projectRoot: string
  ): Promise<ClusteredTrackCandidate[]> {
    if (!annotations || annotations.length === 0) {
      return [];
    }

    // Pre-pass: Detect components referenced across multiple distinct viewIds
    const componentToViews = new Map<string, Set<string>>();
    for (const ann of annotations) {
      const comp = ann.sourceLocation?.componentName?.toLowerCase();
      if (comp && ann.viewId) {
        if (!componentToViews.has(comp)) {
          componentToViews.set(comp, new Set());
        }
        componentToViews.get(comp)!.add(ann.viewId);
      }
    }

    const crossViewComponents = new Set<string>();
    for (const [comp, views] of componentToViews.entries()) {
      if (views.size > 1) {
        crossViewComponents.add(comp);
      }
    }

    // Buckets for 4 layers
    const layer0Notes: SpatialAnnotation[] = [];
    const layer1Map = new Map<string, { componentName: string; notes: SpatialAnnotation[] }>();
    const layer2Map = new Map<string, { viewId: string; notes: SpatialAnnotation[] }>();
    const layer3Map = new Map<string, { workflowId: string; notes: SpatialAnnotation[] }>();

    for (const ann of annotations) {
      // 1. Layer 0: Foundational Tokens take highest precedence per ADR 0003
      if (this.isTokenAnnotation(ann)) {
        layer0Notes.push(ann);
        continue;
      }

      // 2. Layer 3: Explicit workflows
      if (this.isWorkflowAnnotation(ann)) {
        const wfId = ann.viewId || 'e2e_workflow';
        if (!layer3Map.has(wfId)) {
          layer3Map.set(wfId, { workflowId: wfId, notes: [] });
        }
        layer3Map.get(wfId)!.notes.push(ann);
        continue;
      }

      // 3. Layer 1: Shared Golden Components
      const sharedCheck = this.isSharedComponentAnnotation(ann, crossViewComponents);
      if (sharedCheck.isShared && sharedCheck.componentName) {
        const compKey = sharedCheck.componentName.toLowerCase();
        if (!layer1Map.has(compKey)) {
          layer1Map.set(compKey, { componentName: sharedCheck.componentName, notes: [] });
        }
        layer1Map.get(compKey)!.notes.push(ann);
        continue;
      }

      // 4. Layer 2: Downstream Views / Screen Features
      const viewKey = ann.viewId || 'general_view';
      if (!layer2Map.has(viewKey)) {
        layer2Map.set(viewKey, { viewId: viewKey, notes: [] });
      }
      layer2Map.get(viewKey)!.notes.push(ann);
    }

    const candidates: ClusteredTrackCandidate[] = [];

    // --- Build Layer 0 Candidate ---
    let layer0TrackId: string | undefined;
    if (layer0Notes.length > 0) {
      const trackId = this.tokenTrackId || `${this.idPrefix}_layer0_tokens`;
      layer0TrackId = trackId;

      const targetFiles = Array.from(
        new Set(
          layer0Notes
            .map((n) => n.sourceLocation?.filePath)
            .filter((f): f is string => Boolean(f))
        )
      );
      if (targetFiles.length === 0) {
        targetFiles.push('src/theme/tokens.css');
      }

      const affectedComponents = Array.from(
        new Set(
          layer0Notes
            .map((n) => n.sourceLocation?.componentName)
            .filter((c): c is string => Boolean(c))
        )
      );

      const viewIds = Array.from(new Set(layer0Notes.map((n) => n.viewId)));
      const benefitScore = this.calculateBenefitScore(layer0Notes, 5); // +5 foundational priority bonus

      candidates.push({
        trackId,
        title: 'Foundation Design System & Semantic Tokens',
        description:
          'Scaffold and standardize 4-tier semantic design tokens, color palette, and foundational theme variables',
        layer: 0,
        layerName: 'tokens',
        annotations: layer0Notes,
        dependsOn: [],
        dependencies: [],
        benefitScore,
        targetFiles,
        affectedComponents,
        viewIds,
        domain: 'design-tokens',
        tier: 1,
        tcs: 3,
      });
    }

    // --- Build Layer 1 Candidates ---
    const layer1TrackIds: string[] = [];
    const layer1CompToTrackId = new Map<string, string>();

    for (const [compKey, { componentName, notes }] of layer1Map.entries()) {
      const compSlug = sanitizeSlug(compKey);
      const trackId = `${this.idPrefix}_layer1_component_${compSlug}`;
      layer1TrackIds.push(trackId);
      layer1CompToTrackId.set(compKey, trackId);

      const targetFiles = Array.from(
        new Set(
          notes
            .map((n) => n.sourceLocation?.filePath)
            .filter((f): f is string => Boolean(f))
        )
      );
      if (targetFiles.length === 0) {
        targetFiles.push(`src/components/${componentName}.tsx`);
      }

      const viewIds = Array.from(new Set(notes.map((n) => n.viewId)));
      const dependsOn = layer0TrackId ? [layer0TrackId] : [];
      const benefitScore = this.calculateBenefitScore(notes);

      candidates.push({
        trackId,
        title: `Shared Golden Component: ${componentName}`,
        description: `Refactor, standardize, and resolve visual defects for shared component ${componentName}`,
        layer: 1,
        layerName: 'components',
        annotations: notes,
        dependsOn,
        dependencies: [...dependsOn],
        benefitScore,
        targetFiles,
        affectedComponents: [componentName],
        viewIds,
        domain: this.defaultDomain,
        tier: 2,
        tcs: Math.min(5, Math.max(2, Math.ceil(notes.length / 2) + 1)),
      });
    }

    // --- Build Layer 2 Candidates ---
    const layer2TrackIds: string[] = [];
    for (const [viewKey, { viewId, notes }] of layer2Map.entries()) {
      const viewSlug = sanitizeSlug(viewKey.replace(/^view[-_]?/, ''));
      const trackId = `${this.idPrefix}_layer2_view_${viewSlug}`;
      layer2TrackIds.push(trackId);

      const targetFiles = Array.from(
        new Set(
          notes
            .map((n) => n.sourceLocation?.filePath)
            .filter((f): f is string => Boolean(f))
        )
      );

      const affectedComponents = Array.from(
        new Set(
          notes
            .map((n) => n.sourceLocation?.componentName)
            .filter((c): c is string => Boolean(c))
        )
      );

      // Layer 2 depends on Layer 0 and all relevant Layer 1 shared component tracks
      const viewDependencies: string[] = [];
      if (layer0TrackId) {
        viewDependencies.push(layer0TrackId);
      }

      // Check if view explicitly references any Layer 1 components
      const matchedLayer1Tracks = new Set<string>();
      for (const comp of affectedComponents) {
        const tId = layer1CompToTrackId.get(comp.toLowerCase());
        if (tId) {
          matchedLayer1Tracks.add(tId);
        }
      }

      // If specific components were matched, depend on them; otherwise depend on all Layer 1 tracks
      // to ensure shared components are upgraded before downstream views are touched
      if (matchedLayer1Tracks.size > 0) {
        viewDependencies.push(...Array.from(matchedLayer1Tracks));
      } else if (layer1TrackIds.length > 0) {
        viewDependencies.push(...layer1TrackIds);
      }

      const benefitScore = this.calculateBenefitScore(notes);
      const displayTitle = viewKey
        .replace(/^view[-_]?/i, '')
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      candidates.push({
        trackId,
        title: `Downstream View: ${displayTitle || viewId}`,
        description: `Implement screen-specific enhancements and layout adjustments for ${viewId}`,
        layer: 2,
        layerName: 'views',
        annotations: notes,
        dependsOn: viewDependencies,
        dependencies: [...viewDependencies],
        benefitScore,
        targetFiles,
        affectedComponents,
        viewIds: [viewId],
        domain: this.defaultDomain,
        tier: 2,
        tcs: Math.min(5, Math.max(3, Math.ceil(notes.length / 2) + 2)),
      });
    }

    // --- Build Layer 3 Candidates ---
    for (const [wfKey, { workflowId, notes }] of layer3Map.entries()) {
      const wfSlug = sanitizeSlug(wfKey.replace(/^workflow[-_]?/, ''));
      const trackId = `${this.idPrefix}_layer3_workflow_${wfSlug}`;

      const targetFiles = Array.from(
        new Set(
          notes
            .map((n) => n.sourceLocation?.filePath)
            .filter((f): f is string => Boolean(f))
        )
      );

      const affectedComponents = Array.from(
        new Set(
          notes
            .map((n) => n.sourceLocation?.componentName)
            .filter((c): c is string => Boolean(c))
        )
      );

      const viewIds = Array.from(new Set(notes.map((n) => n.viewId)));

      // Layer 3 (workflows/e2e) depends on all prerequisite layers
      const wfDependencies: string[] = [];
      if (layer0TrackId) wfDependencies.push(layer0TrackId);
      wfDependencies.push(...layer1TrackIds);
      wfDependencies.push(...layer2TrackIds);

      const benefitScore = this.calculateBenefitScore(notes);

      candidates.push({
        trackId,
        title: `Workflow & E2E Integration: ${workflowId}`,
        description: `End-to-end integration and multi-view workflow validation for ${workflowId}`,
        layer: 3,
        layerName: 'workflows',
        annotations: notes,
        dependsOn: wfDependencies,
        dependencies: [...wfDependencies],
        benefitScore,
        targetFiles,
        affectedComponents,
        viewIds,
        domain: 'e2e',
        tier: 3,
        tcs: 5,
      });
    }

    return candidates;
  }

  /**
   * Plans topological execution waves for clustered track candidates using ExecutionPlanner.
   */
  public planWaves(candidates: ClusteredTrackCandidate[]): ClusteredTrackCandidate[][] {
    return ExecutionPlanner.planWaves(candidates) as ClusteredTrackCandidate[][];
  }
}
