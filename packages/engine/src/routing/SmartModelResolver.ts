import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ActiveModelSelection } from '../types/shared-schema.js';
import { CacheManager as StorageCacheManager } from '../cache/CacheManager.js';

export interface SmartModelResolverOptions {
  agentConfigPath?: string;
  activeModelPath?: string;
  forceSwitch?: boolean;
  caduceusApiUrl?: string;
}

export class SmartModelResolver {
  private agentConfigPath: string;
  private activeModelPath: string;
  private forceSwitch: boolean;
  private caduceusApiUrl: string;

  constructor(options: SmartModelResolverOptions = {}) {
    const home = os.homedir();
    this.agentConfigPath = options.agentConfigPath || path.join(process.cwd(), 'superconductor', 'agent-config.md');
    this.activeModelPath = options.activeModelPath || path.join(home, '.gemini', 'active_model.json');
    this.forceSwitch = options.forceSwitch || false;
    this.caduceusApiUrl = options.caduceusApiUrl || 'http://localhost:1691';
  }

  /**
   * Reads tier mappings from superconductor/agent-config.md or falls back to defaults.
   */
  public parseAgentConfig(): Record<string, string> {
    const defaults: Record<string, string> = {
      tier1: 'shell',
      tier2: 'gemini-2.0-flash-lite',
      tier3: 'gemini-2.5-pro',
      tier4: 'gemini-2.5-pro'
    };

    if (!fs.existsSync(this.agentConfigPath)) {
      return defaults;
    }

    try {
      const content = fs.readFileSync(this.agentConfigPath, 'utf8');
      const mappings: Record<string, string> = { ...defaults };
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('Tier 2')) {
          const match = line.match(/`([^`]+)`/);
          if (match && match[1]) mappings.tier2 = match[1];
        } else if (line.includes('Tier 3')) {
          const match = line.match(/`([^`]+)`/);
          if (match && match[1]) mappings.tier3 = match[1];
        } else if (line.includes('Tier 4')) {
          const match = line.match(/`([^`]+)`/);
          if (match && match[1]) mappings.tier4 = match[1];
        }
      }
      return mappings;
    } catch {
      return defaults;
    }
  }

  /**
   * Resolves active model for a requested tier.
   * Compares with ~/.gemini/active_model.json.
   * If model changed or forceSwitch is true, returns shouldPrompt: true.
   */
  public async resolve(tier: string, taskType?: string): Promise<{ selection: ActiveModelSelection; shouldPrompt: boolean }> {
    const mappings = this.parseAgentConfig();
    let model = mappings[tier] || mappings.tier3 || 'gemini-2.5-pro';
    let source: ActiveModelSelection['source'] = 'cache';

    // Try Caduceus history-based suggestion if taskType provided
    if (taskType) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 200);
        const res = await fetch(`${this.caduceusApiUrl}/api/suggest-model?taskType=${encodeURIComponent(taskType)}`, {
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data && data.suggestedModel && data.sampleCount >= 5) {
            model = data.suggestedModel;
            source = 'caduceus_suggestion';
          }
        }
      } catch {
        // Silent fail over to standard mapping
      }
    }

    const storage = new StorageCacheManager<ActiveModelSelection>(this.activeModelPath);
    const lastActive = storage.read();

    const shouldPrompt = this.forceSwitch || !lastActive || lastActive.model !== model;

    const selection: ActiveModelSelection = {
      model,
      tier,
      updatedAt: new Date().toISOString(),
      source
    };

    // Atomic save to ~/.gemini/active_model.json
    storage.write(selection);

    return { selection, shouldPrompt };
  }
}
