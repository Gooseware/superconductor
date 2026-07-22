import { describe, it, expect } from 'vitest';
import type {
  Track,
  AgentMessage,
  RegistryComponent,
  ComponentStagingManifest,
  ModelTierConfig,
  IModelRouter,
  SuperconductorContext,
  AgentTurnEvent,
  AdaptiveRouteSuggestion
} from '../src/types/shared-schema.js';

describe('Shared Schema Type Contracts', () => {
  it('instantiates Track correctly', () => {
    const track: Track = {
      trackId: 'test_20260722',
      title: 'Test Track',
      type: 'feature',
      status: 'planned',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      description: 'Test track description'
    };
    expect(track.trackId).toBe('test_20260722');
  });

  it('instantiates ComponentStagingManifest correctly', () => {
    const manifest: ComponentStagingManifest = {
      componentId: 'btn_123',
      trackId: 'track_1',
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'atom',
        description: 'Button component',
        tags: ['ui'],
        dependencies: []
      },
      files: [{ path: 'Button.tsx', content: 'export const Button = () => null;' }]
    };
    expect(manifest.componentId).toBe('btn_123');
    expect(manifest.files.length).toBe(1);
  });

  it('instantiates AgentTurnEvent correctly', () => {
    const event: AgentTurnEvent = {
      id: 'evt_1',
      eventType: 'task_completed',
      sessionId: 'sess_1',
      trackId: 'track_1',
      phase: 'Phase 1',
      taskDescription: 'Implement feature',
      modelUsed: 'gemini-2.5-pro',
      taskType: 'feature_implementation',
      success: true,
      timestamp: new Date().toISOString()
    };
    expect(event.eventType).toBe('task_completed');
    expect(event.success).toBe(true);
  });
});
