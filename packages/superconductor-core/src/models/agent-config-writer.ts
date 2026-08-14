import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type ConfigScope = 'global' | 'project' | 'session';

export interface AgentRoleAssignments {
  'superconductor-processor'?: string;
  'superconductor-reviewer'?: string;
  'superconductor-reviewer (quorum)'?: string;
  'superconductor-dreamer'?: string;
  'superconductor-oracle'?: string;
  'remediation-processor'?: string;
  [role: string]: string | undefined;
}

export interface AgentConfigData {
  tier2?: string;
  tier3?: string;
  tier4?: string;
  proxyEndpoint?: string | null;
  researchProvider?: string;
  swarmMode?: string;
  revokedTools?: string;
  roles: AgentRoleAssignments;
}

export const DEFAULT_AGENT_ROLES: AgentRoleAssignments = {
  'superconductor-processor': 'gemini-3.6-flash-high',
  'superconductor-reviewer': 'gemini-3.6-flash-high',
  'superconductor-reviewer (quorum)': 'gemini-3.6-flash-high',
  'superconductor-dreamer': 'gemini-3.1-pro-high',
  'superconductor-oracle': 'gemini-3.1-pro-high',
  'remediation-processor': 'gemini-3.6-flash-high',
};

export const DEFAULT_AGENT_CONFIG: AgentConfigData = {
  tier2: 'gemini-3.6-flash-high',
  tier3: 'gemini-3.6-flash-high',
  tier4: 'gemini-3.1-pro-high',
  proxyEndpoint: null,
  researchProvider: 'gemini-api-deep-research',
  swarmMode: 'inactive',
  revokedTools: 'write_file, run_command, multi_replace_file_content',
  roles: { ...DEFAULT_AGENT_ROLES },
};

export interface AgentConfigWriterOptions {
  projectRoot?: string;
  projectConfigPath?: string;
  globalConfigPath?: string;
  fsImplementation?: typeof fs;
  sessionOverrides?: Partial<AgentConfigData>;
}

export interface ResolveOptions {
  sessionOverrides?: Partial<AgentConfigData>;
  projectPath?: string;
  globalPath?: string;
  projectRoot?: string;
}

export interface WriteOptions {
  projectPath?: string;
  globalPath?: string;
  projectRoot?: string;
}

export interface ParseConfigOptions {
  withDefaults?: boolean;
}

export class AgentConfigWriter {
  private projectRoot: string;
  private projectConfigPath: string;
  private globalConfigPath: string;
  private fs: typeof fs;
  private sessionOverrides: Partial<AgentConfigData>;

  constructor(options: AgentConfigWriterOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.projectConfigPath =
      options.projectConfigPath ?? path.join(this.projectRoot, 'superconductor', 'agent-config.md');
    this.globalConfigPath =
      options.globalConfigPath ?? path.join(os.homedir(), '.gemini', 'agent-config.md');
    this.fs = options.fsImplementation ?? fs;
    this.sessionOverrides = options.sessionOverrides ?? {};
  }

  /**
   * Parses markdown configuration content into structured AgentConfigData.
   */
  public static parseConfig(
    content: string,
    options: ParseConfigOptions = { withDefaults: true }
  ): AgentConfigData {
    const withDefaults = options.withDefaults ?? true;
    const config: AgentConfigData = {
      tier2: withDefaults ? DEFAULT_AGENT_CONFIG.tier2 : undefined,
      tier3: withDefaults ? DEFAULT_AGENT_CONFIG.tier3 : undefined,
      tier4: withDefaults ? DEFAULT_AGENT_CONFIG.tier4 : undefined,
      proxyEndpoint: withDefaults ? DEFAULT_AGENT_CONFIG.proxyEndpoint : undefined,
      researchProvider: withDefaults ? DEFAULT_AGENT_CONFIG.researchProvider : undefined,
      swarmMode: withDefaults ? DEFAULT_AGENT_CONFIG.swarmMode : undefined,
      revokedTools: withDefaults ? DEFAULT_AGENT_CONFIG.revokedTools : undefined,
      roles: withDefaults ? { ...DEFAULT_AGENT_ROLES } : {},
    };

    if (!content || typeof content !== 'string') {
      return config;
    }

    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      // Tier 2
      const t2Match = line.match(/Tier\s*2.*?:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (t2Match) {
        config.tier2 = t2Match[1].trim();
      }

      // Tier 3
      const t3Match = line.match(/Tier\s*3.*?:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (t3Match) {
        config.tier3 = t3Match[1].trim();
      }

      // Tier 4
      const t4Match = line.match(/Tier\s*4.*?:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (t4Match) {
        config.tier4 = t4Match[1].trim();
      }

      // Proxy Endpoint
      const proxyMatch = line.match(/Proxy\s*Endpoint\s*:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (proxyMatch) {
        const val = proxyMatch[1].trim();
        config.proxyEndpoint = val === '(none)' || val === '' ? null : val;
      }

      // Research Provider
      const researchMatch = line.match(/Research\s*Provider\s*:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (researchMatch) {
        config.researchProvider = researchMatch[1].trim();
      }

      // Swarm Mode
      const swarmMatch = line.match(/Swarm\s*Mode\s*:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (swarmMatch) {
        config.swarmMode = swarmMatch[1].trim();
      }

      // Revoked Tools
      const revokedMatch = line.match(/Revoked\s*Tools.*?:(?:\s*\*+)?\s*`?([^`\n]+)`?/i);
      if (revokedMatch) {
        config.revokedTools = revokedMatch[1].trim();
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

  /**
   * Updates an existing markdown configuration string with partial updates,
   * strictly preserving all other markdown sections, comments, and structure.
   */
  public updateConfigMarkdown(existingMarkdown: string, updates: Partial<AgentConfigData>): string {
    if (!existingMarkdown || existingMarkdown.trim().length === 0) {
      return this.generateDefaultMarkdown(updates);
    }

    let updated = existingMarkdown;

    // 1. Update Tier lines if specified
    if (updates.tier2) {
      updated = updated.replace(/(- \*\*Tier 2[^:]*:\*\*\s*)(`?[^`\n]+`?)/, `$1\`${updates.tier2}\``);
    }
    if (updates.tier3) {
      updated = updated.replace(/(- \*\*Tier 3[^:]*:\*\*\s*)(`?[^`\n]+`?)/, `$1\`${updates.tier3}\``);
    }
    if (updates.tier4) {
      updated = updated.replace(/(- \*\*Tier 4[^:]*:\*\*\s*)(`?[^`\n]+`?)/, `$1\`${updates.tier4}\``);
    }
    if (updates.proxyEndpoint !== undefined) {
      const valStr = updates.proxyEndpoint ? `\`${updates.proxyEndpoint}\`` : '(none)';
      updated = updated.replace(/(- \*\*Proxy Endpoint:\*\*\s*)(`?[^`\n]+`?)/, `$1${valStr}`);
    }
    if (updates.researchProvider) {
      updated = updated.replace(
        /(- \*\*Research Provider:\*\*\s*)(`?[^`\n]+`?)/,
        `$1\`${updates.researchProvider}\``
      );
    }
    if (updates.swarmMode) {
      updated = updated.replace(/(- \*\*Swarm Mode:\*\*\s*)(`?[^`\n]+`?)/, `$1${updates.swarmMode}`);
    }
    if (updates.revokedTools) {
      updated = updated.replace(
        /(- \*\*Revoked Tools[^:]*:\*\*\s*)(`?[^`\n]+`?)/,
        `$1${updates.revokedTools}`
      );
    }

    // 2. Update Swarm Agent Model Assignments table
    if (updates.roles && Object.keys(updates.roles).length > 0) {
      const existingConfig = AgentConfigWriter.parseConfig(existingMarkdown, { withDefaults: false });
      const mergedRoles: AgentRoleAssignments = {
        ...existingConfig.roles,
        ...updates.roles,
      };

      const tableRows = this.buildTableRows(mergedRoles);
      const fullTable = `| Role | Model |\n|------|-------|\n${tableRows}`;

      const tableRegex = /(##\s*Swarm Agent Model Assignments\s*\n+)([\s\S]*?)(?=\n##|\n---|$)/i;
      if (tableRegex.test(updated)) {
        updated = updated.replace(tableRegex, `$1${fullTable}\n`);
      } else {
        // Append section before Proxy Settings or at the end of routing tier
        const proxyRegex = /(##\s*Proxy & Endpoint Settings)/i;
        if (proxyRegex.test(updated)) {
          updated = updated.replace(
            proxyRegex,
            `## Swarm Agent Model Assignments\n\n${fullTable}\n\n$1`
          );
        } else {
          updated = `${updated.trimEnd()}\n\n## Swarm Agent Model Assignments\n\n${fullTable}\n`;
        }
      }
    }

    return updated;
  }

  /**
   * Generates a standard default agent-config.md markdown document with provided values.
   */
  public generateDefaultMarkdown(config: Partial<AgentConfigData> = {}): string {
    const merged: AgentConfigData = {
      tier2: config.tier2 ?? DEFAULT_AGENT_CONFIG.tier2,
      tier3: config.tier3 ?? DEFAULT_AGENT_CONFIG.tier3,
      tier4: config.tier4 ?? DEFAULT_AGENT_CONFIG.tier4,
      proxyEndpoint: config.proxyEndpoint !== undefined ? config.proxyEndpoint : DEFAULT_AGENT_CONFIG.proxyEndpoint,
      researchProvider: config.researchProvider ?? DEFAULT_AGENT_CONFIG.researchProvider,
      swarmMode: config.swarmMode ?? DEFAULT_AGENT_CONFIG.swarmMode,
      revokedTools: config.revokedTools ?? DEFAULT_AGENT_CONFIG.revokedTools,
      roles: {
        ...DEFAULT_AGENT_ROLES,
        ...(config.roles || {}),
      },
    };

    const tableRows = this.buildTableRows(merged.roles);
    const proxyStr = merged.proxyEndpoint ? `\`${merged.proxyEndpoint}\`` : '(none)';

    return `# Agent Configuration

This file configures the model preferences and proxy endpoints for the Superconductor agent.

## Model Mappings per Routing Tier

Adjust the mapping of model identifiers to each logic tier based on your provider and budget:

- **Tier 2 (Triage & Extraction):** \`${merged.tier2}\`
- **Tier 3 (Standard Inference / Processors):** \`${merged.tier3}\`
- **Tier 3 (Quorum Reviewers):** \`${merged.tier3}\`
- **Tier 4 (Frontier Reasoning / Oracle):** \`${merged.tier4}\`

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
${tableRows}

## Proxy & Endpoint Settings

Specify an optional custom endpoint (e.g., LiteLLM, OpenRouter, or a local server) if you route traffic through a central gateway:

- **Proxy Endpoint:** ${proxyStr}
- **Research Provider:** \`${merged.researchProvider}\`

---

## Configuration Resolution Order

1. **Project Override:** The active agent resolves \`superconductor/agent-config.md\` first. If present, it takes precedence.
2. **Global Default:** If no project override exists, the agent falls back to the global default configuration at \`~/.gemini/agent-config.md\`.
3. **Internal Default:** If neither configuration file exists, the agent falls back to internal default model identifiers (\`gemini-2.0-flash-lite\`, \`gemini-2.5-pro\`).

## Swarm Mode

- **Swarm Mode:** ${merged.swarmMode}
- **Revoked Tools (when active):** ${merged.revokedTools}

By default, Swarm Mode is inactive. When activated, the root model will have its file and terminal write access revoked to prevent rogue writes.
`;
  }

  private buildTableRows(roles: AgentRoleAssignments): string {
    const standardOrder = [
      'superconductor-processor',
      'superconductor-reviewer (quorum)',
      'superconductor-reviewer',
      'superconductor-dreamer',
      'superconductor-oracle',
      'remediation-processor',
    ];

    const rendered = new Set<string>();
    const lines: string[] = [];

    // Render standard roles first in defined order
    for (const role of standardOrder) {
      if (roles[role] !== undefined && !rendered.has(role)) {
        // Skip duplicate superconductor-reviewer if superconductor-reviewer (quorum) is present with same value
        if (role === 'superconductor-reviewer' && rendered.has('superconductor-reviewer (quorum)')) {
          continue;
        }
        lines.push(`| ${role} | \`${roles[role]}\` |`);
        rendered.add(role);
      }
    }

    // Render any additional custom roles
    for (const [role, model] of Object.entries(roles)) {
      if (model && !rendered.has(role)) {
        lines.push(`| ${role} | \`${model}\` |`);
        rendered.add(role);
      }
    }

    return lines.join('\n');
  }

  /**
   * Resolves the active agent configuration following the multi-tier hierarchy:
   * 1. Runtime/Ephemeral Session Overrides
   * 2. Project config (`superconductor/agent-config.md`)
   * 3. Global config (`~/.gemini/agent-config.md`)
   * 4. Built-in defaults
   */
  public resolve(options: ResolveOptions = {}): AgentConfigData {
    let resolved: AgentConfigData = {
      tier2: DEFAULT_AGENT_CONFIG.tier2,
      tier3: DEFAULT_AGENT_CONFIG.tier3,
      tier4: DEFAULT_AGENT_CONFIG.tier4,
      proxyEndpoint: DEFAULT_AGENT_CONFIG.proxyEndpoint,
      researchProvider: DEFAULT_AGENT_CONFIG.researchProvider,
      swarmMode: DEFAULT_AGENT_CONFIG.swarmMode,
      revokedTools: DEFAULT_AGENT_CONFIG.revokedTools,
      roles: { ...DEFAULT_AGENT_ROLES },
    };

    // 1. Global config file
    const globalPath = options.globalPath ?? this.globalConfigPath;
    if (this.fs.existsSync(globalPath)) {
      try {
        const globalContent = this.fs.readFileSync(globalPath, 'utf-8');
        const parsedGlobal = AgentConfigWriter.parseConfig(globalContent, { withDefaults: false });
        resolved = this.mergeConfigs(resolved, parsedGlobal);
      } catch {
        // Ignore read errors
      }
    }

    // 2. Project config file
    const projectPath =
      options.projectPath ??
      (options.projectRoot
        ? path.join(options.projectRoot, 'superconductor', 'agent-config.md')
        : this.projectConfigPath);

    if (this.fs.existsSync(projectPath)) {
      try {
        const projectContent = this.fs.readFileSync(projectPath, 'utf-8');
        const parsedProject = AgentConfigWriter.parseConfig(projectContent, { withDefaults: false });
        resolved = this.mergeConfigs(resolved, parsedProject);
      } catch {
        // Ignore read errors
      }
    }

    // 3. Session overrides
    const sessionOverrides = options.sessionOverrides ?? this.sessionOverrides;
    if (sessionOverrides) {
      resolved = this.mergeConfigs(resolved, sessionOverrides);
    }

    return resolved;
  }

  private mergeConfigs(base: AgentConfigData, override: Partial<AgentConfigData>): AgentConfigData {
    return {
      tier2: override.tier2 !== undefined ? override.tier2 : base.tier2,
      tier3: override.tier3 !== undefined ? override.tier3 : base.tier3,
      tier4: override.tier4 !== undefined ? override.tier4 : base.tier4,
      proxyEndpoint: override.proxyEndpoint !== undefined ? override.proxyEndpoint : base.proxyEndpoint,
      researchProvider: override.researchProvider !== undefined ? override.researchProvider : base.researchProvider,
      swarmMode: override.swarmMode !== undefined ? override.swarmMode : base.swarmMode,
      revokedTools: override.revokedTools !== undefined ? override.revokedTools : base.revokedTools,
      roles: {
        ...base.roles,
        ...(override.roles || {}),
      },
    };
  }

  /**
   * Writes updates to the project configuration file (`superconductor/agent-config.md`).
   */
  public writeProjectConfig(
    updates: Partial<AgentConfigData>,
    customPath?: string,
    projectRoot?: string
  ): void {
    const targetPath =
      customPath ??
      (projectRoot ? path.join(projectRoot, 'superconductor', 'agent-config.md') : this.projectConfigPath);

    this.writeFileSafely(targetPath, updates);
  }

  /**
   * Writes updates to the global configuration file (`~/.gemini/agent-config.md`).
   */
  public writeGlobalConfig(updates: Partial<AgentConfigData>, customPath?: string): void {
    const targetPath = customPath ?? this.globalConfigPath;
    this.writeFileSafely(targetPath, updates);
  }

  /**
   * Writes configuration according to specified scope ('global' | 'project' | 'session').
   */
  public writeConfig(
    scope: ConfigScope,
    updates: Partial<AgentConfigData>,
    options: WriteOptions = {}
  ): void {
    if (scope === 'project') {
      this.writeProjectConfig(updates, options.projectPath, options.projectRoot);
    } else if (scope === 'global') {
      this.writeGlobalConfig(updates, options.globalPath);
    } else if (scope === 'session') {
      this.sessionOverrides = this.mergeConfigs(
        { roles: {}, ...this.sessionOverrides },
        updates
      );
    }
  }

  private writeFileSafely(targetPath: string, updates: Partial<AgentConfigData>): void {
    const dir = path.dirname(targetPath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }

    if (this.fs.existsSync(targetPath)) {
      const existing = this.fs.readFileSync(targetPath, 'utf-8');
      const updated = this.updateConfigMarkdown(existing, updates);
      this.fs.writeFileSync(targetPath, updated, 'utf-8');
    } else {
      const initial = this.generateDefaultMarkdown(updates);
      this.fs.writeFileSync(targetPath, initial, 'utf-8');
    }
  }
}
