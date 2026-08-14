import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ModelChooserDialog,
  type ModelChooserOptions,
  type ModelChooserResult,
} from '../../src/models/model-chooser-dialog.js';
import { ModelCatalogService, type DiscoveredModel } from '../../src/models/model-catalog-service.js';
import { AgentConfigWriter } from '../../src/models/agent-config-writer.js';

const MOCK_MODELS: DiscoveredModel[] = [
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)' },
  { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash (High)' },
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
];

describe('ModelChooserDialog', () => {
  let tempDir: string;
  let projectConfigPath: string;
  let globalConfigPath: string;
  let mockCatalog: ModelCatalogService;
  let mockLogger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-chooser-test-'));
    projectConfigPath = path.join(tempDir, 'superconductor', 'agent-config.md');
    globalConfigPath = path.join(tempDir, '.gemini', 'agent-config.md');

    mockCatalog = new ModelCatalogService({
      execCommand: () => '',
    });
    vi.spyOn(mockCatalog, 'getModels').mockReturnValue(MOCK_MODELS);

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Interactive Options Generation from ModelCatalogService', () => {
    it('should generate choice items for roles from discovered models catalog', () => {
      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
      });

      const choices = dialog.getRoleChoices(MOCK_MODELS, 'gemini-3.6-flash-high');
      expect(choices).toHaveLength(MOCK_MODELS.length);
      expect(choices[0]).toEqual({
        title: 'Gemini 3.7 Flash (High)',
        value: 'gemini-3.7-flash-high',
        description: 'gemini-3.7-flash-high',
      });
      expect(choices[1]).toEqual({
        title: 'Gemini 3.6 Flash (High) (current)',
        value: 'gemini-3.6-flash-high',
        description: 'gemini-3.6-flash-high',
      });
    });

    it('should build prompt questions for all Superconductor roles', () => {
      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
      });

      const promptQuestions = dialog.buildRolePrompts(MOCK_MODELS, {
        'superconductor-processor': 'gemini-3.6-flash-high',
        'superconductor-reviewer': 'gemini-3.6-flash-high',
        'superconductor-dreamer': 'gemini-3.1-pro-high',
        'superconductor-oracle': 'gemini-3.1-pro-high',
        'remediation-processor': 'gemini-3.6-flash-high',
      });

      expect(promptQuestions).toHaveLength(5);
      expect(promptQuestions.map((q) => q.name)).toEqual([
        'superconductor-processor',
        'superconductor-reviewer',
        'superconductor-dreamer',
        'superconductor-oracle',
        'remediation-processor',
      ]);
    });

    it('should build scope prompt options with Project, Global, and Session choices', () => {
      const dialog = new ModelChooserDialog();
      const scopePrompt = dialog.buildScopePrompt();

      expect(scopePrompt.name).toBe('scope');
      expect(scopePrompt.type).toBe('select');
      expect(scopePrompt.choices).toEqual([
        {
          title: 'Project Override',
          value: 'project',
          description: 'superconductor/agent-config.md (current repository)',
        },
        {
          title: 'Global Default',
          value: 'global',
          description: '~/.gemini/agent-config.md (user-wide default)',
        },
        {
          title: 'Session / Once-off',
          value: 'session',
          description: 'In-memory ephemeral override (this session only)',
        },
      ]);
    });
  });

  describe('Interactive Role Assignment & Persistence Scopes', () => {
    it('should prompt user, collect selections, and persist to project config when scope is project', async () => {
      const mockPromptFn = vi
        .fn()
        .mockResolvedValueOnce({
          'superconductor-processor': 'gemini-3.7-flash-high',
          'superconductor-reviewer': 'gemini-3.7-flash-high',
          'superconductor-dreamer': 'claude-opus-4-6-thinking',
          'superconductor-oracle': 'claude-opus-4-6-thinking',
          'remediation-processor': 'gemini-3.7-flash-high',
        })
        .mockResolvedValueOnce({
          scope: 'project',
        });

      const configWriter = new AgentConfigWriter({
        projectConfigPath,
        globalConfigPath,
      });

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        configWriter,
        promptFn: mockPromptFn,
        logger: mockLogger,
        projectConfigPath,
        globalConfigPath,
      });

      const result = await dialog.run();

      expect(result.cancelled).toBe(false);
      expect(result.scope).toBe('project');
      expect(result.assignments['superconductor-processor']).toBe('gemini-3.7-flash-high');
      expect(result.assignments['superconductor-dreamer']).toBe('claude-opus-4-6-thinking');

      // Verify written to project config file
      expect(fs.existsSync(projectConfigPath)).toBe(true);
      const content = fs.readFileSync(projectConfigPath, 'utf-8');
      expect(content).toContain('| superconductor-processor | `gemini-3.7-flash-high` |');
      expect(content).toContain('| superconductor-dreamer | `claude-opus-4-6-thinking` |');
    });

    it('should persist to global config when scope is global', async () => {
      const mockPromptFn = vi
        .fn()
        .mockResolvedValueOnce({
          'superconductor-processor': 'claude-sonnet-4-6',
          'superconductor-reviewer': 'claude-sonnet-4-6',
          'superconductor-dreamer': 'claude-opus-4-6-thinking',
          'superconductor-oracle': 'claude-opus-4-6-thinking',
          'remediation-processor': 'gpt-oss-120b-medium',
        })
        .mockResolvedValueOnce({
          scope: 'global',
        });

      const configWriter = new AgentConfigWriter({
        projectConfigPath,
        globalConfigPath,
      });

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        configWriter,
        promptFn: mockPromptFn,
        logger: mockLogger,
        projectConfigPath,
        globalConfigPath,
      });

      const result = await dialog.run();

      expect(result.scope).toBe('global');
      expect(fs.existsSync(globalConfigPath)).toBe(true);
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      expect(content).toContain('| superconductor-processor | `claude-sonnet-4-6` |');
      expect(content).toContain('| remediation-processor | `gpt-oss-120b-medium` |');
    });

    it('should not write to disk when scope is session / once-off', async () => {
      const mockPromptFn = vi
        .fn()
        .mockResolvedValueOnce({
          'superconductor-processor': 'gemini-3.7-flash-high',
          'superconductor-reviewer': 'gemini-3.7-flash-high',
          'superconductor-dreamer': 'gemini-3.1-pro-high',
          'superconductor-oracle': 'gemini-3.1-pro-high',
          'remediation-processor': 'gemini-3.7-flash-high',
        })
        .mockResolvedValueOnce({
          scope: 'session',
        });

      const configWriter = new AgentConfigWriter({
        projectConfigPath,
        globalConfigPath,
      });

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        configWriter,
        promptFn: mockPromptFn,
        logger: mockLogger,
        projectConfigPath,
        globalConfigPath,
      });

      const result = await dialog.run();

      expect(result.scope).toBe('session');
      expect(fs.existsSync(projectConfigPath)).toBe(false);
      expect(fs.existsSync(globalConfigPath)).toBe(false);
    });

    it('should handle prompt cancellation gracefully', async () => {
      const mockPromptFn = vi.fn().mockResolvedValue({});

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        promptFn: mockPromptFn,
        logger: mockLogger,
      });

      const result = await dialog.run();
      expect(result.cancelled).toBe(true);
    });
  });

  describe('CLI Flag Execution & Model Listing', () => {
    it('should support --list flag to print catalog models', async () => {
      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        logger: mockLogger,
      });

      const result = await dialog.run(['--list']);
      expect(result.cancelled).toBe(false);
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Available Models'));
      expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('gemini-3.7-flash-high'));
    });

    it('should support headless flag configuration with --scope and role flags', async () => {
      const configWriter = new AgentConfigWriter({
        projectConfigPath,
        globalConfigPath,
      });

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        configWriter,
        logger: mockLogger,
        projectConfigPath,
        globalConfigPath,
      });

      const result = await dialog.run([
        '--scope=project',
        '--processor=gemini-3.7-flash-high',
        '--oracle=claude-opus-4-6-thinking',
      ]);

      expect(result.scope).toBe('project');
      expect(result.assignments['superconductor-processor']).toBe('gemini-3.7-flash-high');
      expect(result.assignments['superconductor-oracle']).toBe('claude-opus-4-6-thinking');

      expect(fs.existsSync(projectConfigPath)).toBe(true);
      const content = fs.readFileSync(projectConfigPath, 'utf-8');
      expect(content).toContain('| superconductor-processor | `gemini-3.7-flash-high` |');
      expect(content).toContain('| superconductor-oracle | `claude-opus-4-6-thinking` |');
    });

    it('should force refresh catalog when --refresh-models is passed', async () => {
      const refreshSpy = vi.spyOn(mockCatalog, 'refresh').mockReturnValue(MOCK_MODELS);

      const dialog = new ModelChooserDialog({
        modelCatalog: mockCatalog,
        logger: mockLogger,
      });

      await dialog.run(['--list', '--refresh-models']);
      expect(refreshSpy).toHaveBeenCalled();
    });
  });
});
