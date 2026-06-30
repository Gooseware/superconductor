import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Resolves global and project-level model tier configurations.
 */
export class AgentConfigResolver {
  /**
   * @param {Object} filesystem - Custom file system implementation (defaults to Node's fs).
   * @param {Object} env - Environment variables object (defaults to process.env).
   */
  constructor(filesystem = fs, env = process.env) {
    this.fs = filesystem;
    this.env = env;
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
   * Reads and parses the active configuration.
   * @returns {Object} Config object with tier2, tier3, tier4, and proxyEndpoint.
   */
  resolveConfig() {
    const paths = this.resolvePaths();
    for (const p of paths) {
      if (this.fs.existsSync(p)) {
        try {
          const content = this.fs.readFileSync(p, 'utf8');
          return this.parseConfig(content);
        } catch (e) {
          // Ignore read error and try next path
        }
      }
    }

    // Default configuration fallback
    return {
      tier2: 'gemini-2.0-flash-lite',
      tier3: 'gemini-2.5-pro',
      tier4: 'gemini-2.5-pro (thinking)',
      proxyEndpoint: null
    };
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
      proxyEndpoint: null
    };

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

    return config;
  }
}
