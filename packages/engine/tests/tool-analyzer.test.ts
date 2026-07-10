import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { ToolAnalyzer } from '../src/routing/tool-analyzer.js';
import { DagNode } from '../src/types/dag.types.js';

describe('ToolAnalyzer', () => {
  const mockAgyOutput = `
Plugin: design-os-kernel
Capabilities: design, layout

Plugin: notebook-viewer
Capabilities: jupyter, read-only

Plugin: fs-writer
Capabilities: write, fs

Plugin: fs-reader
Capabilities: read, fs
`;

  it('parses mock agy plugin list output into PluginInfo[]', () => {
    const analyzer = new ToolAnalyzer(new EventEmitter());
    const plugins = analyzer.parsePluginList(mockAgyOutput);
    
    expect(plugins).toHaveLength(4);
    expect(plugins[0].name).toBe('design-os-kernel');
    expect(plugins[0].capabilities).toEqual(['design', 'layout']);
    expect(plugins[3].name).toBe('fs-reader');
    expect(plugins[3].capabilities).toEqual(['read', 'fs']);
  });

  it('generates correct --disable-plugin flags for an editor task (disable design/notebook plugins)', () => {
    const analyzer = new ToolAnalyzer(new EventEmitter());
    const plugins = analyzer.parsePluginList(mockAgyOutput);
    
    const editorTask: DagNode = {
      id: 'task-1',
      role: 'editor',
      tier: 3,
      status: 'pending',
      prompt: 'Edit this file',
      contextFiles: ['src/app.ts']
    };

    const result = analyzer.analyze(editorTask, plugins);
    
    expect(result.disabledPlugins).toContain('design-os-kernel');
    expect(result.disabledPlugins).toContain('notebook-viewer');
    expect(result.disabledPlugins).not.toContain('fs-writer');
    
    expect(result.flags).toContain('--disable-plugin=design-os-kernel');
    expect(result.flags).toContain('--disable-plugin=notebook-viewer');
  });

  it('generates correct flags for an architect task (disable code-write plugins)', () => {
    const analyzer = new ToolAnalyzer(new EventEmitter());
    const plugins = analyzer.parsePluginList(mockAgyOutput);
    
    const architectTask: DagNode = {
      id: 'task-2',
      role: 'architect',
      tier: 1,
      status: 'pending',
      prompt: 'Design the system',
      contextFiles: []
    };

    const result = analyzer.analyze(architectTask, plugins);
    
    expect(result.disabledPlugins).toContain('fs-writer');
    expect(result.flags).toContain('--disable-plugin=fs-writer');
  });

  it('allowlist overrides preserve explicitly required plugins', () => {
    const analyzer = new ToolAnalyzer(new EventEmitter());
    const plugins = analyzer.parsePluginList(mockAgyOutput);
    
    const editorTask: DagNode = {
      id: 'task-3',
      role: 'editor',
      tier: 3,
      status: 'pending',
      prompt: 'Edit design',
      contextFiles: []
    };

    // Editor normally disables design-os-kernel, but allowlist explicitly allows it
    const result = analyzer.analyze(editorTask, plugins, { allowedPlugins: ['design-os-kernel'] });
    
    expect(result.disabledPlugins).not.toContain('design-os-kernel');
    expect(result.flags).not.toContain('--disable-plugin=design-os-kernel');
  });

  it('emits telemetry event with estimated token savings', () => {
    const emitter = new EventEmitter();
    const spy = vi.spyOn(emitter, 'emit');
    const analyzer = new ToolAnalyzer(emitter);
    const plugins = analyzer.parsePluginList(mockAgyOutput);
    
    const architectTask: DagNode = {
      id: 'task-4',
      role: 'architect',
      tier: 1,
      status: 'pending',
      prompt: 'Plan',
      contextFiles: []
    };

    const result = analyzer.analyze(architectTask, plugins);
    
    expect(spy).toHaveBeenCalledWith('event', expect.objectContaining({
      type: 'routing',
      detail: expect.objectContaining({
        disabledPlugins: expect.any(Array),
        estimatedTokenSavings: expect.any(Number)
      })
    }));
    
    // Default estimated savings (e.g. 500 tokens per disabled plugin)
    expect(result.estimatedTokenSavings).toBeGreaterThan(0);
  });
});
