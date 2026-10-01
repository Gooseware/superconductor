import { describe, it, expect, beforeEach } from 'vitest';
import {
  type ViewSnapshot,
  type SpatialAnnotation,
  type ProposalPatch,
  type PreviewInstance,
  type SurfaceAdapter,
  MockSurfaceAdapter,
  validateViewSnapshot,
  validateSpatialAnnotation,
  validateProposalPatch,
  serializeViewSnapshot,
  deserializeViewSnapshot,
  serializeSpatialAnnotation,
  deserializeSpatialAnnotation,
  serializeProposalPatch,
  deserializeProposalPatch,
} from '../../src/visual/surface-adapter.js';
import { ViteWebSurfaceAdapter } from '../../src/visual/vite-harness.js';

describe('SurfaceAdapter Interface & Types', () => {
  const sampleAnnotation: SpatialAnnotation = {
    id: 'ann-1',
    viewId: 'view-button',
    type: 'pin',
    selector: 'button.btn-primary',
    xpath: '//button[contains(@class, "btn-primary")]',
    sourceLocation: {
      filePath: 'src/components/Button.tsx',
      componentName: 'Button',
      lineNumber: 42,
      columnNumber: 8,
    },
    geometry: {
      x: 120,
      y: 85,
      width: 140,
      height: 48,
    },
    author: 'reviewer@superconductor.dev',
    comment: 'The primary button contrast ratio is 3.8:1, failing WCAG AA (requires 4.5:1).',
    tags: ['accessibility', 'wcag-aa', 'contrast'],
    severity: 'blocker',
    createdAt: '2026-10-01T12:00:00Z',
  };

  const sampleSnapshot: ViewSnapshot = {
    id: 'view-button',
    title: 'Primary Button Component',
    sourceType: 'web_component',
    filePath: 'src/components/Button.tsx',
    entryPoint: 'src/index.ts',
    route: '/components/button',
    dimensions: { width: 1280, height: 720 },
    annotations: [sampleAnnotation],
  };

  const samplePatch: ProposalPatch = {
    id: 'patch-button-contrast',
    title: 'Elevate button contrast to WCAG AA compliant indigo-700',
    targetFilePath: 'src/components/Button.tsx',
    jsxReplacement: '<button className="bg-indigo-700 hover:bg-indigo-800 text-white font-medium px-4 py-2 rounded">{props.children}</button>',
    cssDelta: '.btn-primary { background-color: #4338ca !important; color: #ffffff !important; }',
    injectedProps: {
      children: 'Submit Feedback',
      disabled: false,
    },
  };

  describe('Validation', () => {
    it('should validate a complete ViewSnapshot successfully', () => {
      const result = validateViewSnapshot(sampleSnapshot);
      expect(result.id).toBe('view-button');
      expect(result.sourceType).toBe('web_component');
      expect(result.annotations).toHaveLength(1);
    });

    it('should validate all supported source types', () => {
      const types = ['web_component', 'web_page', 'terminal_cli', 'static_image'] as const;
      for (const t of types) {
        const snap: ViewSnapshot = {
          id: `view-${t}`,
          title: `View for ${t}`,
          sourceType: t,
          filePath: `path/to/${t}`,
        };
        expect(() => validateViewSnapshot(snap)).not.toThrow();
      }
    });

    it('should reject an invalid ViewSnapshot with missing required fields', () => {
      expect(() => validateViewSnapshot({ id: '', title: '' })).toThrow();
      expect(() => validateViewSnapshot({
        id: 'bad',
        title: 'Bad',
        sourceType: 'unknown_type',
        filePath: 'foo.tsx',
      })).toThrow();
    });

    it('should validate a SpatialAnnotation with bounding_box and source location', () => {
      const bboxAnnotation: SpatialAnnotation = {
        ...sampleAnnotation,
        id: 'ann-2',
        type: 'bounding_box',
        severity: 'enhancement',
      };
      const result = validateSpatialAnnotation(bboxAnnotation);
      expect(result.type).toBe('bounding_box');
      expect(result.severity).toBe('enhancement');
    });

    it('should validate all severity ratings', () => {
      const severities = ['blocker', 'enhancement', 'refactor', 'nitpick'] as const;
      for (const severity of severities) {
        const ann: SpatialAnnotation = {
          ...sampleAnnotation,
          id: `ann-${severity}`,
          severity,
        };
        expect(() => validateSpatialAnnotation(ann)).not.toThrow();
      }
    });

    it('should reject invalid SpatialAnnotation', () => {
      expect(() => validateSpatialAnnotation({
        id: 'bad',
        viewId: 'v1',
        type: 'triangle', // invalid
        geometry: {},
      })).toThrow();
    });

    it('should validate a ProposalPatch with jsxReplacement and cssDelta', () => {
      const result = validateProposalPatch(samplePatch);
      expect(result.id).toBe('patch-button-contrast');
      expect(result.jsxReplacement).toBeDefined();
      expect(result.cssDelta).toContain('.btn-primary');
      expect(result.injectedProps).toEqual({
        children: 'Submit Feedback',
        disabled: false,
      });
    });

    it('should reject invalid ProposalPatch with missing required fields', () => {
      expect(() => validateProposalPatch({ title: 'No id or target' })).toThrow();
    });
  });

  describe('Serialization & Deserialization', () => {
    it('should round-trip ViewSnapshot to JSON and back', () => {
      const json = serializeViewSnapshot(sampleSnapshot);
      expect(typeof json).toBe('string');
      const deserialized = deserializeViewSnapshot(json);
      expect(deserialized).toEqual(sampleSnapshot);
    });

    it('should round-trip SpatialAnnotation to JSON and back', () => {
      const json = serializeSpatialAnnotation(sampleAnnotation);
      const deserialized = deserializeSpatialAnnotation(json);
      expect(deserialized).toEqual(sampleAnnotation);
    });

    it('should round-trip ProposalPatch to JSON and back', () => {
      const json = serializeProposalPatch(samplePatch);
      const deserialized = deserializeProposalPatch(json);
      expect(deserialized).toEqual(samplePatch);
    });

    it('should fail deserialization on corrupted JSON or invalid data', () => {
      expect(() => deserializeViewSnapshot('{ "invalid": true }')).toThrow();
      expect(() => deserializeSpatialAnnotation('not-json')).toThrow();
      expect(() => deserializeProposalPatch('{ "id": "1" }')).toThrow();
    });
  });

  describe('SurfaceAdapter Implementations', () => {
    let mockAdapter: MockSurfaceAdapter;

    beforeEach(() => {
      mockAdapter = new MockSurfaceAdapter('test_mock_adapter', [sampleSnapshot]);
    });

    it('should conform to SurfaceAdapter interface contract', async () => {
      const adapter: SurfaceAdapter = mockAdapter;
      expect(adapter.name).toBe('test_mock_adapter');

      const detected = await adapter.detect('/test/project');
      expect(detected).toBe(true);

      const views = await adapter.discoverViews('/test/project');
      expect(views).toHaveLength(1);
      expect(views[0].id).toBe('view-button');
    });

    it('should mount a preview instance and return destroy hook', async () => {
      const instance: PreviewInstance = await mockAdapter.mountPreview('view-button');
      expect(instance.viewId).toBe('view-button');
      expect(instance.url).toContain('/preview/view-button');
      expect(typeof instance.destroy).toBe('function');
      await expect(instance.destroy()).resolves.toBeUndefined();
    });

    it('should throw an error when mounting an unknown viewId', async () => {
      await expect(mockAdapter.mountPreview('non-existent-view')).rejects.toThrow(
        "View 'non-existent-view' not found"
      );
    });

    it('should support dynamic view registration', async () => {
      const newView: ViewSnapshot = {
        id: 'view-header',
        title: 'App Header',
        sourceType: 'web_component',
        filePath: 'src/components/Header.tsx',
      };
      mockAdapter.addView(newView);

      const views = await mockAdapter.discoverViews('/test/project');
      expect(views).toHaveLength(2);
      expect(views.map(v => v.id)).toContain('view-header');
    });
  });

  describe('ViteWebSurfaceAdapter', () => {
    it('should detect valid project containing package.json', async () => {
      const adapter = new ViteWebSurfaceAdapter();
      const detected = await adapter.detect(process.cwd());
      expect(detected).toBe(true);
    });

    it('should register views and mount previews', async () => {
      const adapter = new ViteWebSurfaceAdapter();
      adapter.registerView(sampleSnapshot);

      const views = await adapter.discoverViews(process.cwd());
      expect(views).toHaveLength(1);
      expect(views[0].id).toBe('view-button');

      const preview = await adapter.mountPreview('view-button');
      expect(preview.viewId).toBe('view-button');
      expect(preview.url).toContain('/@superconductor/entry');

      await adapter.getHarness().stop();
    });
  });
});
