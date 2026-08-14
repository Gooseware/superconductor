import fs from 'fs';
import path from 'path';
import os from 'os';

export const DEFAULT_ROLE_ASSIGNMENTS = {
  'superconductor-processor': 'gemini-3.6-flash-high',
  'superconductor-reviewer': 'gemini-3.6-flash-high',
  'superconductor-reviewer (quorum)': 'gemini-3.6-flash-high',
  'superconductor-dreamer': 'gemini-3.1-pro-high',
  'superconductor-oracle': 'gemini-3.1-pro-high',
  'remediation-processor': 'gemini-3.6-flash-high'
};

/**
 * Resolves global, project-level, and session model tier and role configurations.
 */
export class AgentConfigResolver {
  /**
   * @param {Object} filesystem - Custom file system implementation (defaults to Node's fs).
   * @param {Object} env - Environment variables object (defaults to process.env).
   * @param {Object} [sessionOverrides=null] - Optional runtime session overrides.
   */
  constructor(filesystem = fs, env = process.env, sessionOverrides = null) {
    this.fs = filesystem;
    this.env = env;
    this.sessionOverrides = sessionOverrides;
  }

  /**
   * Resolves the paths to check, project first, then global.
   * @returns {string[]} List of configuration paths.
   */
  resolvePaths() {
    const paths = [];
    // 1. Project path
    paths.push('superconductor/agent-config.md');

    // 2. Global path (homedir/.gemini/agent-config.md)
    const homeDir = this.env.HOME || this.env.USERPROFILE || os.homedir();
    if (homeDir) {
      paths.push(path.join(homeDir, '.gemini', 'agent-config.md'));
    }

    return paths;
  }

  /**
   * Reads and parses the active configuration across hierarchy.
   * @param {Object} [ephemeralOverrides=null] - Optional runtime session overrides.
   * @returns {Object} Config object with tier2, tier3, tier4, proxyEndpoint, and roles.
   */
  resolveConfig(ephemeralOverrides = null) {
    let resolvedConfig = {
      tier2: 'gemini-2.0-flash-lite',
      tier3: 'gemini-2.5-pro',
      tier4: 'gemini-2.5-pro (thinking)',
      proxyEndpoint: null,
      roles: { ...DEFAULT_ROLE_ASSIGNMENTS }
    };

    const paths = this.resolvePaths();
    // Resolve in reverse order (global then project) so project overrides global
    for (const p of [...paths].reverse()) {
      if (this.fs.existsSync(p)) {
        try {
          const content = this.fs.readFileSync(p, 'utf8');
          const parsed = this.parseConfig(content);
          resolvedConfig = {
            ...resolvedConfig,
            ...parsed,
            roles: {
              ...resolvedConfig.roles,
              ...(parsed.roles || {})
            }
          };
        } catch (e) {
          // Ignore read error and try next path
        }
      }
    }

    // Apply session overrides if provided
    const session = ephemeralOverrides || this.sessionOverrides;
    if (session) {
      resolvedConfig = {
        ...resolvedConfig,
        ...session,
        roles: {
          ...resolvedConfig.roles,
          ...(session.roles || {})
        }
      };
    }

    return resolvedConfig;
  }

  /**
   * Returns the resolved model for a specific role.
   * @param {string} role - Role identifier (e.g., 'superconductor-processor').
   * @param {Object} [ephemeralOverrides=null] - Optional runtime session overrides.
   * @returns {string} Model identifier.
   */
  getModelForRole(role, ephemeralOverrides = null) {
    const config = this.resolveConfig(ephemeralOverrides);
    if (config.roles && config.roles[role]) {
      return config.roles[role];
    }
    if (role === 'superconductor-reviewer' && config.roles && config.roles['superconductor-reviewer (quorum)']) {
      return config.roles['superconductor-reviewer (quorum)'];
    }
    return DEFAULT_ROLE_ASSIGNMENTS[role] || config.tier3 || 'gemini-3.6-flash-high';
  }

  /**
   * Parses markdown configuration content.
   * @param {string} content - Markdown content of the configuration file.
   * @returns {Object} Config object.
   */
  parseConfig(content) {
    const config = {
      tier2: 'gemini-2.0-flash-lite',
      tier3: 'gemini-2.5-pro',
      tier4: 'gemini-2.5-pro (thinking)',
      proxyEndpoint: null,
      roles: { ...DEFAULT_ROLE_ASSIGNMENTS }
    };

    if (!content || typeof content !== 'string') {
      return config;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      // Parse Tier 2
      const t2Match = line.match(/Tier\s*2.*?:(?:\s*\*+)?\s*\`?([^\n`]+)\`?/i);
      if (t2Match) {
        config.tier2 = t2Match[1].trim();
      }
      // Parse Tier 3
      const t3Match = line.match(/Tier\s*3.*?:(?:\s*\*+)?\s*\`?([^\n`]+)\`?/i);
      if (t3Match) {
        config.tier3 = t3Match[1].trim();
      }
      // Parse Tier 4
      const t4Match = line.match(/Tier\s*4.*?:(?:\s*\*+)?\s*\`?([^\n`]+)\`?/i);
      if (t4Match) {
        config.tier4 = t4Match[1].trim();
      }
      // Parse Proxy Endpoint
      const proxyMatch = line.match(/Proxy\s*Endpoint\s*:(?:\s*\*+)?\s*\`?([^\n`]+)\`?/i);
      if (proxyMatch) {
        const val = proxyMatch[1].trim();
        config.proxyEndpoint = (val === '(none)' || val === '') ? null : val;
      }
    }

    // Parse Swarm Agent Model Assignments table
    const tableSectionMatch = content.match(/##\s*Swarm Agent Model Assignments[\s\S]*?(?=\n##|\n---|$)/i);
    if (tableSectionMatch) {
      const tableContent = tableSectionMatch[0];
      const tableLines = tableContent.split(/\r?\n/);
      for (const tLine of tableLines) {
        const rowMatch = tLine.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
        if (rowMatch) {
          const role = rowMatch[1].trim();
          const model = rowMatch[2].trim().replace(/^`|`$/g, '').trim();
          if (
            role.toLowerCase() !== 'role' &&
            !role.startsWith('---') &&
            !role.startsWith(':---') &&
            !role.startsWith('-')
          ) {
            config.roles[role] = model;
            if (role === 'superconductor-reviewer (quorum)') {
              config.roles['superconductor-reviewer'] = model;
            } else if (role === 'superconductor-reviewer' && !config.roles['superconductor-reviewer (quorum)']) {
              config.roles['superconductor-reviewer (quorum)'] = model;
            }
          }
        }
      }
    }

    return config;
  }
}
