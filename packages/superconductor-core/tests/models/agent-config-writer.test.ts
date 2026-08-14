import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AgentConfigWriter,
  DEFAULT_AGENT_CONFIG,
  type AgentConfigData,
} from '../../src/models/agent-config-writer.js';

const SAMPLE_EXISTING_MARKDOWN = `# Agent Configuration

This file configures the model preferences and proxy endpoints for the Superconductor agent.

## Model Mappings per Routing Tier

Adjust the mapping of model identifiers to each logic tier based on your provider and budget:

- **Tier 2 (Triage & Extraction):** \`gemini-3.6-flash-high\`
- **Tier 3 (Standard Inference / Processors):** \`gemini-3.6-flash-high\`
- **Tier 3 (Quorum Reviewers):** \`gemini-3.6-flash-high\`
- **Tier 4 (Frontier Reasoning / Oracle):** \`gemini-3.1-pro-high\`

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`gemini-3.6-flash-high\` |
| superconductor-reviewer (quorum) | \`gemini-3.6-flash-high\` |
| superconductor-dreamer | \`gemini-3.1-pro-high\` |
| superconductor-oracle | \`gemini-3.1-pro-high\` |

## Proxy & Endpoint Settings

Specify an optional custom endpoint (e.g., LiteLLM, OpenRouter, or a local server) if you route traffic through a central gateway:

- **Proxy Endpoint:** (none)
- **Research Provider:** \`gemini-api-deep-research\`

---

## Configuration Resolution Order

1. **Project Override:** The active agent resolves \`superconductor/agent-config.md\` first. If present, it takes precedence.
2. **Global Default:** If no project override exists, the agent falls back to the global default configuration at \`~/.gemini/agent-config.md\`.
3. **Internal Default:** If neither configuration file exists, the agent falls back to internal default model identifiers (\`gemini-2.0-flash-lite\`, \`gemini-2.5-pro\`).

## Reviewer Agent

The \`superconductor-reviewer\` agent uses a system prompt that permanently bakes in the **8-item Shenanigan Checklist**.
`;

describe('AgentConfigWriter', () => {
  let tempDir: string;
  let projectConfigPath: string;
  let globalConfigPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-writer-test-'));
    projectConfigPath = path.join(tempDir, 'superconductor', 'agent-config.md');
    globalConfigPath = path.join(tempDir, '.gemini', 'agent-config.md');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Markdown Parsing', () => {
    it('should parse existing agent-config.md markdown content accurately', () => {
      const parsed = AgentConfigWriter.parseConfig(SAMPLE_EXISTING_MARKDOWN);

      expect(parsed.tier2).toBe('gemini-3.6-flash-high');
      expect(parsed.tier3).toBe('gemini-3.6-flash-high');
      expect(parsed.tier4).toBe('gemini-3.1-pro-high');
      expect(parsed.proxyEndpoint).toBeNull();
      expect(parsed.researchProvider).toBe('gemini-api-deep-research');

      expect(parsed.roles).toBeDefined();
      expect(parsed.roles['superconductor-processor']).toBe('gemini-3.6-flash-high');
      expect(parsed.roles['superconductor-reviewer (quorum)']).toBe('gemini-3.6-flash-high');
      expect(parsed.roles['superconductor-reviewer']).toBe('gemini-3.6-flash-high');
      expect(parsed.roles['superconductor-dreamer']).toBe('gemini-3.1-pro-high');
      expect(parsed.roles['superconductor-oracle']).toBe('gemini-3.1-pro-high');
    });

    it('should handle custom proxy endpoint and custom role rows', () => {
      const customMarkdown = `
# Agent Configuration
- **Tier 2:** custom-flash
- **Tier 3:** custom-pro
- **Tier 4:** custom-thinking
- **Proxy Endpoint:** https://proxy.example.com/v1

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`claude-sonnet-4-6\` |
| superconductor-reviewer | \`claude-sonnet-4-6\` |
| remediation-processor | \`gpt-oss-120b-medium\` |
| custom-agent | \`gemini-3.7-flash-high\` |
`;
      const parsed = AgentConfigWriter.parseConfig(customMarkdown);
      expect(parsed.tier2).toBe('custom-flash');
      expect(parsed.tier3).toBe('custom-pro');
      expect(parsed.tier4).toBe('custom-thinking');
      expect(parsed.proxyEndpoint).toBe('https://proxy.example.com/v1');
      expect(parsed.roles['superconductor-processor']).toBe('claude-sonnet-4-6');
      expect(parsed.roles['superconductor-reviewer']).toBe('claude-sonnet-4-6');
      expect(parsed.roles['remediation-processor']).toBe('gpt-oss-120b-medium');
      expect(parsed.roles['custom-agent']).toBe('gemini-3.7-flash-high');
    });

    it('should fallback to defaults when parsing empty or malformed markdown', () => {
      const parsed = AgentConfigWriter.parseConfig('');
      expect(parsed.tier2).toBe(DEFAULT_AGENT_CONFIG.tier2);
      expect(parsed.tier3).toBe(DEFAULT_AGENT_CONFIG.tier3);
      expect(parsed.tier4).toBe(DEFAULT_AGENT_CONFIG.tier4);
      expect(parsed.roles['superconductor-processor']).toBe(DEFAULT_AGENT_CONFIG.roles['superconductor-processor']);
    });
  });

  describe('Markdown Updating & Section Preservation', () => {
    it('should update Swarm Agent Model Assignments table while preserving all other sections and comments', () => {
      const writer = new AgentConfigWriter();
      const updatedMarkdown = writer.updateConfigMarkdown(SAMPLE_EXISTING_MARKDOWN, {
        roles: {
          'superconductor-processor': 'gemini-3.7-flash-high',
          'remediation-processor': 'gemini-3.7-flash-medium',
        },
      });

      // Verifies table update
      expect(updatedMarkdown).toContain('| superconductor-processor | `gemini-3.7-flash-high` |');
      expect(updatedMarkdown).toContain('| remediation-processor | `gemini-3.7-flash-medium` |');
      expect(updatedMarkdown).toContain('| superconductor-oracle | `gemini-3.1-pro-high` |');

      // Verifies preservation of existing sections and text
      expect(updatedMarkdown).toContain('# Agent Configuration');
      expect(updatedMarkdown).toContain('## Model Mappings per Routing Tier');
      expect(updatedMarkdown).toContain('## Reviewer Agent');
      expect(updatedMarkdown).toContain('The `superconductor-reviewer` agent uses a system prompt that permanently bakes in the **8-item Shenanigan Checklist**.');
      expect(updatedMarkdown).toContain('## Configuration Resolution Order');
    });

    it('should add Swarm Agent Model Assignments section if not present in existing markdown', () => {
      const bareMarkdown = `# Agent Configuration\n\n- **Tier 2:** flash\n- **Tier 3:** pro\n`;
      const writer = new AgentConfigWriter();
      const updated = writer.updateConfigMarkdown(bareMarkdown, {
        roles: {
          'superconductor-processor': 'claude-sonnet-4-6',
        },
      });

      expect(updated).toContain('## Swarm Agent Model Assignments');
      expect(updated).toContain('| superconductor-processor | `claude-sonnet-4-6` |');
      expect(updated).toContain('# Agent Configuration');
      expect(updated).toContain('- **Tier 2:** flash');
    });
  });

  describe('Multi-Tier Resolution Hierarchy', () => {
    it('should resolve through hierarchy: Session > Project > Global > Defaults', () => {
      // 1. Defaults only
      const writer = new AgentConfigWriter({
        projectConfigPath: path.join(tempDir, 'nonexistent-project.md'),
        globalConfigPath: path.join(tempDir, 'nonexistent-global.md'),
      });

      const resolvedDefaults = writer.resolve();
      expect(resolvedDefaults.roles['superconductor-processor']).toBe(DEFAULT_AGENT_CONFIG.roles['superconductor-processor']);
      expect(resolvedDefaults.roles['superconductor-oracle']).toBe(DEFAULT_AGENT_CONFIG.roles['superconductor-oracle']);

      // 2. Global file created
      fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
      fs.writeFileSync(
        globalConfigPath,
        writer.updateConfigMarkdown(SAMPLE_EXISTING_MARKDOWN, {
          tier3: 'global-tier3',
          roles: {
            'superconductor-processor': 'global-flash',
            'superconductor-oracle': 'global-pro',
          },
        })
      );

      const resolvedGlobal = writer.resolve({ globalPath: globalConfigPath });
      expect(resolvedGlobal.roles['superconductor-processor']).toBe('global-flash');
      expect(resolvedGlobal.roles['superconductor-oracle']).toBe('global-pro');

      // 3. Project file overrides Global
      fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
      fs.writeFileSync(
        projectConfigPath,
        `# Project Config\n## Swarm Agent Model Assignments\n\n| Role | Model |\n|------|-------|\n| superconductor-processor | \`project-flash-override\` |\n`,
        'utf-8'
      );

      const resolvedProject = writer.resolve({
        projectPath: projectConfigPath,
        globalPath: globalConfigPath,
      });
      expect(resolvedProject.roles['superconductor-processor']).toBe('project-flash-override');
      // Oracle was not in project override, so inherits from global
      expect(resolvedProject.roles['superconductor-oracle']).toBe('global-pro');

      // 4. Ephemeral/Session overrides Project and Global
      const resolvedSession = writer.resolve({
        projectPath: projectConfigPath,
        globalPath: globalConfigPath,
        sessionOverrides: {
          roles: {
            'superconductor-processor': 'session-processor-override',
          },
        },
      });
      expect(resolvedSession.roles['superconductor-processor']).toBe('session-processor-override');
      expect(resolvedSession.roles['superconductor-oracle']).toBe('global-pro');
    });
  });

  describe('Writing to Project and Global Configurations', () => {
    it('should write and create global config file if directory does not exist', () => {
      const writer = new AgentConfigWriter({
        globalConfigPath,
      });

      expect(fs.existsSync(globalConfigPath)).toBe(false);

      writer.writeGlobalConfig({
        roles: {
          'superconductor-processor': 'gemini-3.7-flash-high',
          'superconductor-reviewer': 'gemini-3.7-flash-high',
        },
      });

      expect(fs.existsSync(globalConfigPath)).toBe(true);
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      expect(content).toContain('| superconductor-processor | `gemini-3.7-flash-high` |');
      expect(content).toContain('| superconductor-reviewer | `gemini-3.7-flash-high` |');
    });

    it('should update existing project config file safely', () => {
      fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
      fs.writeFileSync(projectConfigPath, SAMPLE_EXISTING_MARKDOWN, 'utf-8');

      const writer = new AgentConfigWriter({
        projectConfigPath,
      });

      writer.writeProjectConfig({
        roles: {
          'superconductor-dreamer': 'claude-opus-4-6-thinking',
          'remediation-processor': 'gemini-3.6-flash-low',
        },
      });

      const updatedContent = fs.readFileSync(projectConfigPath, 'utf-8');
      expect(updatedContent).toContain('| superconductor-dreamer | `claude-opus-4-6-thinking` |');
      expect(updatedContent).toContain('| remediation-processor | `gemini-3.6-flash-low` |');
      expect(updatedContent).toContain('The `superconductor-reviewer` agent uses a system prompt');
    });

    it('should support writeConfig with scope routing (global, project, session)', () => {
      const writer = new AgentConfigWriter({
        projectConfigPath,
        globalConfigPath,
      });

      // Write session
      writer.writeConfig('session', {
        roles: { 'superconductor-oracle': 'session-oracle' },
      });
      expect(fs.existsSync(projectConfigPath)).toBe(false);
      expect(fs.existsSync(globalConfigPath)).toBe(false);
      expect(writer.resolve().roles['superconductor-oracle']).toBe('session-oracle');

      // Write project
      writer.writeConfig('project', {
        roles: { 'superconductor-processor': 'proj-proc' },
      });
      expect(fs.existsSync(projectConfigPath)).toBe(true);
      const projContent = fs.readFileSync(projectConfigPath, 'utf-8');
      expect(projContent).toContain('| superconductor-processor | `proj-proc` |');

      // Write global
      writer.writeConfig('global', {
        roles: { 'superconductor-reviewer': 'glob-rev' },
      });
      expect(fs.existsSync(globalConfigPath)).toBe(true);
      const globContent = fs.readFileSync(globalConfigPath, 'utf-8');
      expect(globContent).toContain('| superconductor-reviewer | `glob-rev` |');
    });
  });
});
