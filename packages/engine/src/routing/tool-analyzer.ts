import { EventEmitter } from 'events';
import { DagNode } from '../types/dag.types.js';
import { PluginInfo, ToolAllowlist, TrimResult } from './tool-analyzer.types.js';
import { RoutingEngineEvent } from '../types/events.js';

const TOKENS_PER_DISABLED_PLUGIN = 500;

export class ToolAnalyzer {
  constructor(private emitter: EventEmitter) {}

  public parsePluginList(output: string): PluginInfo[] {
    const plugins: PluginInfo[] = [];
    const blocks = output.split(/Plugin:\s+/).filter(Boolean);
    
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const name = lines[0].trim();
      if (!name) continue;

      let capabilities: string[] = [];
      
      const capLine = lines.find(l => l.startsWith('Capabilities:'));
      if (capLine) {
        capabilities = capLine.replace('Capabilities:', '').split(',').map(s => s.trim()).filter(Boolean);
      }
      
      plugins.push({ name, capabilities });
    }
    
    return plugins;
  }

  public analyze(node: DagNode, availablePlugins: PluginInfo[], allowlist?: ToolAllowlist): TrimResult {
    const disabledPlugins: string[] = [];
    const allowed = new Set(allowlist?.allowedPlugins || []);

    for (const plugin of availablePlugins) {
      if (allowed.has(plugin.name)) {
        continue; // Explicitly allowed
      }

      let shouldDisable = false;

      // Rule: editor task -> disable design/notebook plugins (unless allowed)
      if (node.role === 'editor') {
        if (plugin.capabilities.includes('design') || plugin.capabilities.includes('jupyter') || plugin.capabilities.includes('layout')) {
          shouldDisable = true;
        }
      }

      // Rule: architect task -> disable code-write plugins (fs-writer)
      if (node.role === 'architect') {
        if (plugin.capabilities.includes('write')) {
          shouldDisable = true;
        }
      }

      if (shouldDisable) {
        disabledPlugins.push(plugin.name);
      }
    }

    const flags = disabledPlugins.map(p => `--disable-plugin=${p}`).join(' ');
    const estimatedTokenSavings = disabledPlugins.length * TOKENS_PER_DISABLED_PLUGIN;

    const result: TrimResult = {
      disabledPlugins,
      flags,
      estimatedTokenSavings
    };

    const event: RoutingEngineEvent = {
      type: 'routing',
      timestamp: Date.now(),
      detail: result
    };
    
    this.emitter.emit('event', event);

    return result;
  }
}
