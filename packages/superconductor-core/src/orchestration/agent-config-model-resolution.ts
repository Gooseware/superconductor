/**
 * Agent Config Model Resolution
 *
 * Reads superconductor/agent-config.md (project) or ~/.gemini/agent-config.md (global)
 * and resolves role-to-model-tier-enum mappings for use with invoke_subagent.
 *
 * Part of track: agent_config_model_resolution_20260902
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ModelTierEnum = 'flash' | 'flash_lite' | 'pro' | 'inherit';

export interface AgentConfig {
  processor?: string;
  reviewer?: string;
  dreamer?: string;
  oracle?: string;
  remediator?: string;
}

export interface ModelConfig {
  processor: ModelTierEnum;
  reviewer: ModelTierEnum;
  dreamer: ModelTierEnum;
  oracle: ModelTierEnum;
  remediator: ModelTierEnum;
}

export interface ReadAgentConfigOptions {
  globalConfigPath?: string;
}

/**
 * Resolves a model identifier string to a ModelTierEnum ('flash' | 'flash_lite' | 'pro').
 *
 * Pattern matching order:
 * 1. *-flash-lite* → 'flash_lite'
 * 2. *-flash-* or ends with -flash → 'flash'
 * 3. *-pro-* or ends with -pro → 'pro'
 * 4. claude-*-sonnet-* → 'pro'
 * 5. claude-*-opus-* → 'pro'
 * 6. gpt-oss-*-medium → 'flash'
 * 7. unknown → 'flash' (NEVER 'inherit')
 */
export function resolveModelTier(modelId: string): ModelTierEnum {
  if (!modelId || typeof modelId !== 'string') {
    return 'flash';
  }
  const id = modelId.trim().toLowerCase();

  // 1. *-flash-lite* → 'flash_lite'
  if (id.includes('flash-lite') || id.includes('flash_lite')) {
    return 'flash_lite';
  }

  // 2. *-flash-* or ends with -flash → 'flash'
  if (id.includes('flash')) {
    return 'flash';
  }

  // 3. *-pro-* or ends with -pro → 'pro'
  // 4. claude-*-sonnet-* → 'pro'
  // 5. claude-*-opus-* → 'pro'
  if (
    /(?:^|-)pro(?:-|$)/.test(id) ||
    id.includes('sonnet') ||
    id.includes('opus')
  ) {
    return 'pro';
  }

  // 6. gpt-oss-*-medium → 'flash'
  if (id.includes('gpt-oss') && id.includes('medium')) {
    return 'flash';
  }

  // 7. unknown → 'flash' (NEVER 'inherit')
  return 'flash';
}

function parseAgentConfigMarkdown(content: string): AgentConfig {
  const config: AgentConfig = {};
  if (!content || typeof content !== 'string') {
    return config;
  }

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const rowMatch = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!rowMatch) {
      continue;
    }

    const role = rowMatch[1].trim().toLowerCase();
    const model = rowMatch[2].trim().replace(/^`+|`+$/g, '').trim();

    if (!model || role === 'role' || role.startsWith('---') || role.startsWith(':---') || role.startsWith('-')) {
      continue;
    }

    if (role === 'superconductor-processor') {
      config.processor = model;
    } else if (role === 'superconductor-reviewer (quorum)') {
      config.reviewer = model;
    } else if (role === 'superconductor-reviewer' && !config.reviewer) {
      config.reviewer = model;
    } else if (role === 'superconductor-dreamer') {
      config.dreamer = model;
    } else if (role === 'superconductor-oracle') {
      config.oracle = model;
    } else if (role === 'remediation-processor') {
      config.remediator = model;
    }
  }

  return config;
}

/**
 * Reads agent configuration from project or global config files.
 *
 * Resolution order:
 * 1. {projectRoot}/superconductor/agent-config.md (project override)
 * 2. ~/.gemini/agent-config.md (global fallback, or custom globalConfigPath)
 * 3. {} (empty config if neither exists)
 */
export function readAgentConfig(
  projectRoot: string,
  options?: ReadAgentConfigOptions | string
): AgentConfig {
  if (projectRoot) {
    const projectConfigPath = path.join(projectRoot, 'superconductor', 'agent-config.md');
    if (fs.existsSync(projectConfigPath)) {
      try {
        const content = fs.readFileSync(projectConfigPath, 'utf-8');
        return parseAgentConfigMarkdown(content);
      } catch {
        // Fall back to global config if read fails
      }
    }
  }

  const globalConfigPath =
    typeof options === 'string'
      ? options
      : options?.globalConfigPath ?? path.join(os.homedir(), '.gemini', 'agent-config.md');

  if (globalConfigPath && fs.existsSync(globalConfigPath)) {
    try {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      return parseAgentConfigMarkdown(content);
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Builds a ModelConfig mapping for all 5 swarm roles based on the provided AgentConfig.
 * If a role model is unspecified or unknown, safe defaults are used:
 * - processor: 'flash'
 * - reviewer: 'flash'
 * - dreamer: 'pro'
 * - oracle: 'pro'
 * - remediator: 'flash'
 *
 * Invariant: No role in the returned ModelConfig will ever equal 'inherit'.
 */
export function buildModelConfig(config: AgentConfig = {}): ModelConfig {
  const defaults: ModelConfig = {
    processor: 'flash',
    reviewer: 'flash',
    dreamer: 'pro',
    oracle: 'pro',
    remediator: 'flash',
  };

  const resolve = (model: string | undefined, defaultTier: ModelTierEnum): ModelTierEnum => {
    if (!model) {
      return defaultTier;
    }
    const resolved = resolveModelTier(model);
    return resolved === 'inherit' ? defaultTier : resolved;
  };

  return {
    processor: resolve(config.processor, defaults.processor),
    reviewer: resolve(config.reviewer, defaults.reviewer),
    dreamer: resolve(config.dreamer, defaults.dreamer),
    oracle: resolve(config.oracle, defaults.oracle),
    remediator: resolve(config.remediator, defaults.remediator),
  };
}
