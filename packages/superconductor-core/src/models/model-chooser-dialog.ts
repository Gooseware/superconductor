import * as path from 'path';
import prompts from 'prompts';
import { ModelCatalogService, DiscoveredModel } from './model-catalog-service.js';
import {
  AgentConfigWriter,
  ConfigScope,
  DEFAULT_AGENT_ROLES,
  AgentRoleAssignments,
} from './agent-config-writer.js';

export interface ModelChooserOptions {
  projectRoot?: string;
  projectConfigPath?: string;
  globalConfigPath?: string;
  modelCatalog?: ModelCatalogService;
  configWriter?: AgentConfigWriter;
  promptFn?: (options: any) => Promise<any>;
  logger?: {
    log: (msg: string) => void;
    error: (msg: string) => void;
  };
  forceRefresh?: boolean;
  initialScope?: ConfigScope;
  initialAssignments?: Partial<Record<string, string>>;
}

export interface ModelChooserResult {
  scope: ConfigScope;
  assignments: Record<string, string>;
  cancelled?: boolean;
  writtenPath?: string | null;
}

export interface RoleMeta {
  id: string;
  label: string;
  description: string;
  defaultTier: string;
}

export const SUPERCONDUCTOR_ROLES: RoleMeta[] = [
  {
    id: 'superconductor-processor',
    label: 'Superconductor Processor',
    description: 'Code Implementation & Refactoring (Standard Inference)',
    defaultTier: 'Tier 3 / Flash',
  },
  {
    id: 'superconductor-reviewer',
    label: 'Superconductor Reviewer (Quorum)',
    description: 'Heterogeneous Review Panel (Security, Correctness, Adversarial, Regression)',
    defaultTier: 'Tier 3 / Flash',
  },
  {
    id: 'superconductor-dreamer',
    label: 'Superconductor Dreamer',
    description: 'Architectural Exploration, Topography & Swarm Planning',
    defaultTier: 'Tier 4 / Pro',
  },
  {
    id: 'superconductor-oracle',
    label: 'Superconductor Oracle',
    description: 'Final Sign-off, Audit Synthesis & Quorum Authorization',
    defaultTier: 'Tier 4 / Pro Thinking',
  },
  {
    id: 'remediation-processor',
    label: 'Remediation Processor',
    description: 'Autonomous Remediation Loop Engine & Domain Fix Writer',
    defaultTier: 'Tier 3 / Flash',
  },
];

export interface TierDefinition {
  id: string;
  label: string;
  roles: string[];
}

export const SUPERCONDUCTOR_TIERS: TierDefinition[] = [
  {
    id: 'flash',
    label: 'Tier 3 / Flash',
    roles: ['superconductor-processor', 'superconductor-reviewer', 'remediation-processor'],
  },
  {
    id: 'pro',
    label: 'Tier 4 / Pro',
    roles: ['superconductor-dreamer'],
  },
  {
    id: 'pro-thinking',
    label: 'Tier 4 / Pro Thinking',
    roles: ['superconductor-oracle'],
  },
];

export class ModelChooserDialog {
  private projectRoot: string;
  private projectConfigPath?: string;
  private globalConfigPath?: string;
  private modelCatalog: ModelCatalogService;
  private configWriter: AgentConfigWriter;
  private promptFn: (options: any) => Promise<any>;
  private logger: { log: (msg: string) => void; error: (msg: string) => void };
  private options: ModelChooserOptions;

  constructor(options: ModelChooserOptions = {}) {
    this.options = options;
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.projectConfigPath = options.projectConfigPath;
    this.globalConfigPath = options.globalConfigPath;
    this.modelCatalog = options.modelCatalog ?? new ModelCatalogService();
    this.configWriter =
      options.configWriter ??
      new AgentConfigWriter({
        projectRoot: this.projectRoot,
        projectConfigPath: this.projectConfigPath,
        globalConfigPath: this.globalConfigPath,
      });
    this.promptFn = options.promptFn ?? prompts;
    this.logger = options.logger ?? console;
  }

  /**
   * Generates prompt choices for a specific role given discovered models and current model.
   */
  public getRoleChoices(
    discoveredModels: DiscoveredModel[],
    currentRoleModel?: string
  ): Array<{ title: string; value: string; description: string }> {
    return discoveredModels.map((model) => {
      const isCurrent = currentRoleModel && model.id === currentRoleModel;
      return {
        title: isCurrent ? `${model.name} (current)` : model.name,
        value: model.id,
        description: model.id,
      };
    });
  }

  /**
   * Builds prompt question definitions for all Superconductor roles.
   */
  public buildRolePrompts(
    discoveredModels: DiscoveredModel[],
    currentAssignments: Record<string, string>
  ): any[] {
    return SUPERCONDUCTOR_ROLES.map((role) => {
      const currentModel = currentAssignments[role.id] || DEFAULT_AGENT_ROLES[role.id];
      const choices = this.getRoleChoices(discoveredModels, currentModel);
      const initialIndex = choices.findIndex((c) => c.value === currentModel);

      return {
        type: 'select',
        name: role.id,
        message: `${role.label} — ${role.description}:`,
        choices,
        initial: initialIndex >= 0 ? initialIndex : 0,
      };
    });
  }

  /**
   * Builds prompt for selecting the model configuration mode (tier vs individual).
   */
  public buildModePrompt(): any {
    return {
      type: 'select',
      name: 'mode',
      message: 'How would you like to configure models?',
      choices: [
        { title: 'Use tier defaults', value: 'tier', description: 'Set one model per tier group (3 pickers)' },
        { title: 'Select models individually', value: 'individual', description: 'Configure each role separately (5 pickers)' },
      ],
      initial: 0,
    };
  }

  /**
   * Builds prompt question definitions for tiers.
   */
  public buildTierPrompts(
    discoveredModels: DiscoveredModel[],
    currentAssignments: Record<string, string>
  ): any[] {
    return SUPERCONDUCTOR_TIERS.map((tier) => {
      // Find the first role in this tier that has an assignment, or use default
      const firstRole = tier.roles[0];
      const currentModel = currentAssignments[firstRole] || DEFAULT_AGENT_ROLES[firstRole];
      const choices = this.getRoleChoices(discoveredModels, currentModel);
      const initialIndex = choices.findIndex((c) => c.value === currentModel);

      return {
        type: 'select',
        name: tier.id,
        message: `${tier.label} model — covers: ${tier.roles.join(', ')}:`,
        choices,
        initial: initialIndex >= 0 ? initialIndex : 0,
      };
    });
  }

  /**
   * Builds scope prompt question for configuration persistence scope.
   */
  public buildScopePrompt(): any {
    return {
      type: 'select',
      name: 'scope',
      message: 'Select persistence scope for these model assignments:',
      choices: [
        {
          title: 'Project Override',
          value: 'project',
          description: 'superconductor/agent-config.md (current repository)',
        },
        {
          title: 'Global Default',
          value: 'global',
          description: '~/.gemini/agent-config.md only — does NOT write to project file',
        },
        {
          title: 'Session / Once-off',
          value: 'session',
          description: 'In-memory ephemeral override (this session only)',
        },
      ],
      initial: 0,
    };
  }

  /**
   * Executes the model chooser dialog, supporting interactive prompts and CLI args.
   */
  public async run(args: string[] = []): Promise<ModelChooserResult> {
    let forceRefresh = this.options.forceRefresh || false;
    let listOnly = false;
    let forceMode: 'tier' | 'individual' | undefined;
    let presetScope: ConfigScope | undefined = this.options.initialScope;
    const flagAssignments: Record<string, string> = {};
    if (this.options.initialAssignments) {
      for (const [k, v] of Object.entries(this.options.initialAssignments)) {
        if (v !== undefined) {
          flagAssignments[k] = v;
        }
      }
    }

    // Parse CLI args
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--refresh-models') {
        forceRefresh = true;
      } else if (arg === '--tier-mode') {
        if (forceMode === 'individual') {
          forceMode = 'tier';
          this.logger.log('Warning: Both --tier-mode and --individual-mode provided; using --tier-mode.');
        } else {
          forceMode = 'tier';
        }
      } else if (arg === '--individual-mode') {
        if (forceMode === 'tier') {
          this.logger.log('Warning: Both --tier-mode and --individual-mode provided; using --tier-mode.');
        } else {
          forceMode = 'individual';
        }
      } else if (arg === '--list') {
        listOnly = true;
      } else if (arg.startsWith('--scope=')) {
        presetScope = arg.slice('--scope='.length) as ConfigScope;
      } else if (arg === '--scope' && i + 1 < args.length) {
        presetScope = args[++i] as ConfigScope;
      } else if (arg.startsWith('--processor=')) {
        flagAssignments['superconductor-processor'] = arg.slice('--processor='.length);
      } else if (arg === '--processor' && i + 1 < args.length) {
        flagAssignments['superconductor-processor'] = args[++i];
      } else if (arg.startsWith('--reviewer=')) {
        flagAssignments['superconductor-reviewer'] = arg.slice('--reviewer='.length);
      } else if (arg === '--reviewer' && i + 1 < args.length) {
        flagAssignments['superconductor-reviewer'] = args[++i];
      } else if (arg.startsWith('--dreamer=')) {
        flagAssignments['superconductor-dreamer'] = arg.slice('--dreamer='.length);
      } else if (arg === '--dreamer' && i + 1 < args.length) {
        flagAssignments['superconductor-dreamer'] = args[++i];
      } else if (arg.startsWith('--oracle=')) {
        flagAssignments['superconductor-oracle'] = arg.slice('--oracle='.length);
      } else if (arg === '--oracle' && i + 1 < args.length) {
        flagAssignments['superconductor-oracle'] = args[++i];
      } else if (arg.startsWith('--remediator=')) {
        flagAssignments['remediation-processor'] = arg.slice('--remediator='.length);
      } else if (arg === '--remediator' && i + 1 < args.length) {
        flagAssignments['remediation-processor'] = args[++i];
      }
    }

    // Discover models
    const models = forceRefresh
      ? this.modelCatalog.refresh()
      : this.modelCatalog.getModels({ forceRefresh: false });

    // Handle --list flag
    if (listOnly) {
      this.logger.log('\n🤖 Available Models (Discovered via agy models):');
      models.forEach((m, idx) => {
        this.logger.log(`  ${idx + 1}. \x1b[1m${m.id}\x1b[0m — ${m.name}`);
      });
      return {
        scope: presetScope || 'session',
        assignments: {},
        cancelled: false,
        writtenPath: null,
      };
    }

    // Resolve current configuration
    const currentConfig = this.configWriter.resolve({
      projectPath: this.projectConfigPath,
      globalPath: this.globalConfigPath,
    });

    const currentAssignments: Record<string, string> = {
      'superconductor-processor':
        currentConfig.roles['superconductor-processor'] || DEFAULT_AGENT_ROLES['superconductor-processor']!,
      'superconductor-reviewer':
        currentConfig.roles['superconductor-reviewer'] || DEFAULT_AGENT_ROLES['superconductor-reviewer']!,
      'superconductor-dreamer':
        currentConfig.roles['superconductor-dreamer'] || DEFAULT_AGENT_ROLES['superconductor-dreamer']!,
      'superconductor-oracle':
        currentConfig.roles['superconductor-oracle'] || DEFAULT_AGENT_ROLES['superconductor-oracle']!,
      'remediation-processor':
        currentConfig.roles['remediation-processor'] || DEFAULT_AGENT_ROLES['remediation-processor']!,
      ...flagAssignments,
    };

    // If all flags provided or non-interactive scope specified with flag overrides
    const hasRoleFlags = Object.keys(flagAssignments).length > 0;
    if (hasRoleFlags && presetScope) {
      return this.persistAssignments(presetScope, currentAssignments);
    }

    // Interactive Mode
    this.logger.log('\n🎛️  Superconductor Dynamic Model Chooser');
    this.logger.log('Configure active model identifiers for each Superconductor swarm role:\n');

    let mode = forceMode;
    if (!mode && !hasRoleFlags) {
      const modePrompt = this.buildModePrompt();
      const modeAnswer = await this.promptFn(modePrompt);
      if (!modeAnswer || !modeAnswer.mode) {
        this.logger.log('🛑 Mode selection cancelled.');
        return {
          scope: 'session',
          assignments: {},
          cancelled: true,
          writtenPath: null,
        };
      }
      mode = modeAnswer.mode as 'tier' | 'individual';
    }

    let finalAssignments: Record<string, string> = { ...currentAssignments };

    if (mode === 'tier') {
      const tierPrompts = this.buildTierPrompts(models, currentAssignments);
      const tierAnswers = await this.promptFn(tierPrompts);
      if (!tierAnswers || Object.keys(tierAnswers).length === 0) {
        this.logger.log('🛑 Tier model selection cancelled.');
        return {
          scope: 'session',
          assignments: {},
          cancelled: true,
          writtenPath: null,
        };
      }
      const expandedAssignments = this.expandTierAnswers(tierAnswers);
      finalAssignments = { ...finalAssignments, ...expandedAssignments };
    } else {
      const rolePrompts = this.buildRolePrompts(models, currentAssignments);
      const roleAnswers = await this.promptFn(rolePrompts);

      if (!roleAnswers || Object.keys(roleAnswers).length === 0) {
        this.logger.log('🛑 Model selection cancelled.');
        return {
          scope: 'session',
          assignments: {},
          cancelled: true,
          writtenPath: null,
        };
      }
      finalAssignments = { ...finalAssignments, ...roleAnswers };
    }

    // Scope selection prompt if not preset
    let selectedScope = presetScope;
    if (!selectedScope) {
      const scopePrompt = this.buildScopePrompt();
      const scopeAnswer = await this.promptFn(scopePrompt);
      if (!scopeAnswer || !scopeAnswer.scope) {
        this.logger.log('🛑 Scope selection cancelled.');
        return {
          scope: 'session',
          assignments: {},
          cancelled: true,
          writtenPath: null,
        };
      }
      selectedScope = scopeAnswer.scope as ConfigScope;
    }

    return this.persistAssignments(selectedScope, finalAssignments);
  }

  private expandTierAnswers(tierAnswers: Record<string, string>): Record<string, string> {
    const assignments: Record<string, string> = {};
    for (const tier of SUPERCONDUCTOR_TIERS) {
      const modelId = tierAnswers[tier.id];
      if (modelId) {
        for (const role of tier.roles) {
          assignments[role] = modelId;
        }
      }
    }
    return assignments;
  }

  private persistAssignments(
    scope: ConfigScope,
    assignments: Record<string, string>
  ): ModelChooserResult {
    let writtenPath: string | null = null;

    if (scope === 'project') {
      const targetPath =
        this.projectConfigPath ?? path.join(this.projectRoot, 'superconductor', 'agent-config.md');
      this.configWriter.writeProjectConfig({ roles: assignments }, targetPath);
      writtenPath = targetPath;
      this.logger.log(`\n✅ Saved model assignments to project config: ${targetPath}`);
    } else if (scope === 'global') {
      const targetPath = this.globalConfigPath;
      this.configWriter.writeGlobalConfig({ roles: assignments }, targetPath);
      writtenPath = targetPath || path.join(process.env.HOME || '~', '.gemini', 'agent-config.md');
      this.logger.log(`\n✅ Saved model assignments to global config: ${writtenPath}`);
    } else {
      this.configWriter.writeConfig('session', { roles: assignments });
      this.logger.log('\n✅ Applied model assignments for current session (in-memory ephemeral).');
    }

    return {
      scope,
      assignments,
      cancelled: false,
      writtenPath,
    };
  }

  /**
   * Convenience static runner.
   */
  public static async prompt(
    args: string[] = [],
    options: ModelChooserOptions = {}
  ): Promise<ModelChooserResult> {
    const dialog = new ModelChooserDialog(options);
    return dialog.run(args);
  }
}
