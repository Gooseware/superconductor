/**
 * SkillDogmaValidator
 *
 * Static analysis and security scanning engine for candidate SKILL.md documents.
 * Enforces YAML frontmatter schema, prohibited shell pattern screening,
 * tool whitelisting, anti-hero-agent dogma, and required markdown structure.
 *
 * Invariant: DogmaValidator MUST reject skills containing prohibited shell patterns
 * or invalid tool names.
 */

import yaml from 'js-yaml';

export type DogmaViolationSeverity = 'error' | 'warning';
export type DogmaValidationStatus = 'passed' | 'flagged' | 'rejected';

export interface DogmaViolation {
  rule: string;
  message: string;
  severity: DogmaViolationSeverity;
  line?: number;
  snippet?: string;
  tool?: string;
}

export interface DogmaValidationReport {
  valid: boolean;
  status: DogmaValidationStatus;
  violations: DogmaViolation[];
  warnings: string[];
}

export interface DogmaValidationOptions {
  permittedTools?: string[];
  additionalPermittedTools?: string[];
  rejectOnUnknownTools?: boolean;
  requiredSections?: string[];
  allowDestructiveCommands?: boolean;
}

interface SecurityPatternRule {
  id: string;
  name: string;
  pattern: RegExp;
  description: string;
}

export class SkillDogmaValidator {
  /**
   * Canonical default permitted tools across Superconductor, Design OS, and Agent platforms.
   */
  public static readonly DEFAULT_PERMITTED_TOOLS: ReadonlySet<string> = new Set([
    // Standard Agent File & Search Operations
    'view_file',
    'replace_file_content',
    'write_to_file',
    'list_dir',
    'find_by_name',
    'grep_search',
    'read_file',
    'edit_file',
    'delete_file',
    'create_file',
    'file_search',
    'directory_list',

    // Execution & Orchestration Tools
    'run_command',
    'bash',
    'terminal',
    'execute_command',
    'manage_task',
    'schedule',
    'send_message',
    'call_mcp_tool',
    'list_resources',
    'read_resource',

    // Agent Interaction & Mode Controls
    'ask_user',
    'enter_plan_mode',
    'exit_plan_mode',
    'invoke_subagent',

    // Notebook & Media
    'notebook_edit',
    'notebook_query',
    'notebook_write',
    'notebook_summary',
    'generate_image',
    'search_web',
    'read_url_content',
    'fetch_web_page',

    // Superconductor Task & Invariant Tools
    'task_create',
    'task_update',
    'task_query',
    'task_get_invariants',
    'task_list',
    'invariant_query',
    'invariant_override',
    'invariant_create',

    // Superconductor Kernel & Graph Intelligence Tools
    'kernel_graph_get_node',
    'kernel_graph_get_neighbors',
    'kernel_graph_shortest_path',
    'kernel_intelligence_get_hotspots',
    'kernel_intelligence_get_dependency_graph',
    'kernel_intelligence_status',
    'kernel_policy_get_mode',

    // Design OS Component & Registry Tools
    'set_theme',
    'analyze_visual_inspiration',
    'registry_sync',
    'registry_recommend',
    'registry_install',
    'registry_validate_file',
    'registry_fix_dogma',
    'registry_propose_publish',
    'registry_finalize_publish',
    'publish_vetted_component',
    'add_component_comment',
    'registry_list_blocks',
    'registry_get_block_wiring',
    'registry_remove',
    'add_registry',
    'list_registries',
    'switch_active_registry',

    // AST and Code Modification Tools
    'ast_grep_replace',
    'ast_grep_search',

    // Language Server Tools
    'find_definition',
    'find_references',
    'rename_symbol',
    'rename_symbol_strict',
    'get_diagnostics',
    'restart_server',
    'get_hover',
    'find_workspace_symbols',
    'find_implementation',
    'prepare_call_hierarchy',
    'get_incoming_calls',
    'get_outgoing_calls',

    // DeerFlow Research Tools
    'deerflow_research',
    'deerflow_chat',
    'deerflow_status',
    'deerflow_list_skills',

    // Refero Design Research Tools
    'refero_search_screens',
    'refero_get_similar_screens',
    'refero_get_screen_image',
    'refero_get_screen',
    'refero_search_flows',
    'refero_get_flow',
    'refero_search_styles',
    'refero_get_style',

    // Git / VCS Integration Tools
    'create_issue',
    'list_issues',
    'get_issue',
    'update_issue',
    'create_merge_request',
    'list_merge_requests',
    'get_merge_request',
    'get_file_contents',
    'push_files',
  ]);

  /**
   * Known dangerous shell patterns that warrant immediate rejection.
   */
  public static readonly PROHIBITED_SHELL_PATTERNS: SecurityPatternRule[] = [
    {
      id: 'destructive-rm-root',
      name: 'Recursive delete from root or system directory',
      pattern: /(?:^|[`'";&|\s]|\b)\s*rm\s+(?:-[a-zA-Z0-9_-]+\s+)*-[a-zA-Z0-9]*r[a-zA-Z0-9]*f?[a-zA-Z0-9]*\s+(?:--no-preserve-root\s+)?(?:["']?\/(?:\*)?["']?|["']?\/(?:bin|boot|dev|etc|home|lib|proc|root|sys|usr|var)\b["']?)/i,
      description: 'Destructive recursive rm targeting root or system directory',
    },
    {
      id: 'destructive-rm-home',
      name: 'Recursive delete of home directory',
      pattern: /(?:^|[`'";&|\s]|\b)\s*rm\s+(?:-[a-zA-Z0-9_-]+\s+)*-[a-zA-Z0-9]*r[a-zA-Z0-9]*f?[a-zA-Z0-9]*\s+["']?(?:~|\$HOME|\$\{HOME\})(?:\/|\/\*)?["']?/i,
      description: 'Destructive recursive rm targeting home directory (~ or $HOME)',
    },
    {
      id: 'filesystem-format-mkfs',
      name: 'Direct filesystem creation or format',
      pattern: /\bmkfs(?:\.[a-zA-Z0-9_-]+)?\b/i,
      description: 'Destructive mkfs filesystem formatting command',
    },
    {
      id: 'fork-bomb',
      name: 'Denial of Service fork bomb',
      pattern: /(?::\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:|(\b\w+\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}\s*;\s*\1\b))/,
      description: 'Fork bomb denial-of-service shell pattern',
    },
    {
      id: 'curl-pipe-shell',
      name: 'Remote script execution via pipe to shell',
      pattern: /\b(?:curl|wget)\b[^|\n;]*\|\s*(?:sudo\s+)?(?:ba|z|da|a)?sh\b/i,
      description: 'Arbitrary remote execution pattern: curl/wget piped to shell',
    },
    {
      id: 'chmod-recursive-777',
      name: 'Insecure global permissions chmod -R 777',
      pattern: /\bchmod\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)?0?777(?:\s+-[a-zA-Z]*[rR][a-zA-Z]*)?\b/,
      description: 'Insecure recursive 777 permissions pattern',
    },
    {
      id: 'raw-disk-write',
      name: 'Direct raw disk overwrite',
      pattern: /(?:>|>>)\s*\/dev\/(?:sd[a-z]|nvme[a-z0-9]+|hd[a-z]|vd[a-z]|mem|kmem)\b/i,
      description: 'Raw device redirection overwriting physical disks or memory',
    },
    {
      id: 'dd-disk-overwrite',
      name: 'Direct dd raw device overwrite',
      pattern: /\bdd\s+[^;\n]*\bof=\/dev\/(?:sd[a-z]|nvme[a-z0-9]+|hd[a-z]|vd[a-z]|mem|kmem)\b/i,
      description: 'Direct block-level overwrite of raw block device with dd',
    },
  ];

  /**
   * Anti-Hero-Agent Dogma patterns: detects instructions directing the root orchestrator
   * to directly edit product code or `packages/<package>/src/**` rather than delegating to subagents.
   */
  private static readonly HERO_AGENT_PATTERNS: RegExp[] = [
    /(?:root\s+(?:orchestrator|agent)|orchestrator)[^.\n]*(?:directly\s+(?:edit|modify|write|patch|update)|hero-agent)[^.\n]*packages\/[^\s`*]+\/src/i,
    /(?:directly\s+(?:edit|modify|write|patch|update))\s+`?packages\/(?:\*|[a-zA-Z0-9_-]+)\/src\//i,
    /(?:edit|modify|write|patch|update)\s+`?packages\/(?:\*|[a-zA-Z0-9_-]+)\/src\/[^\s`]*`?\s+(?:directly|in-process)/i,
    /(?:root\s+(?:orchestrator|agent)|orchestrator)[^.\n]*(?:writing|editing|modifying)\s+(?:product\s+code\s+directly|packages\/)/i,
    /root\s+(?:orchestrator|agent)[^.\n]*(?:directly\s+edit|directly\s+modify)/i,
  ];

  /**
   * Regex matching valid kebab-case alphanumeric names.
   * e.g., "my-skill", "skill-123", "continuous-learning"
   */
  private static readonly KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  /**
   * Validate a SKILL.md document against Superconductor and Design OS Dogma rules.
   */
  public static validate(
    skillContent: string,
    options?: DogmaValidationOptions
  ): DogmaValidationReport {
    const violations: DogmaViolation[] = [];
    const warnings: string[] = [];

    // 1. Guard against empty or invalid content
    if (!skillContent || typeof skillContent !== 'string' || !skillContent.trim()) {
      violations.push({
        rule: 'frontmatter-syntax',
        message: 'Skill content is empty or invalid string.',
        severity: 'error',
      });
      return {
        valid: false,
        status: 'rejected',
        violations,
        warnings,
      };
    }

    // 2. Destructive / Prohibited Shell Pattern Screening
    if (!options?.allowDestructiveCommands) {
      for (const rule of this.PROHIBITED_SHELL_PATTERNS) {
        const match = skillContent.match(rule.pattern);
        if (match) {
          violations.push({
            rule: 'prohibited-shell-pattern',
            message: `Prohibited destructive shell pattern detected: ${rule.description} (pattern: ${rule.id}).`,
            severity: 'error',
            snippet: match[0].trim(),
          });
        }
      }
    }

    // 3. Frontmatter Syntax and Schema Validation
    const frontmatterMatch = skillContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    let frontmatter: Record<string, unknown> = {};
    let markdownBody = skillContent;

    if (!frontmatterMatch) {
      violations.push({
        rule: 'frontmatter-syntax',
        message: 'SKILL.md must begin with valid YAML frontmatter enclosed in "---" delimiters.',
        severity: 'error',
      });
    } else {
      markdownBody = frontmatterMatch[2] || '';
      const rawYaml = frontmatterMatch[1];
      try {
        const parsed = yaml.load(rawYaml);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          violations.push({
            rule: 'frontmatter-schema',
            message: 'YAML frontmatter must parse to an object mapping.',
            severity: 'error',
          });
        } else {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch (err: any) {
        violations.push({
          rule: 'frontmatter-syntax',
          message: `Malformed YAML frontmatter syntax: ${err?.message || String(err)}`,
          severity: 'error',
        });
      }

      // Check name schema
      const name = frontmatter.name;
      if (!name || typeof name !== 'string' || !name.trim()) {
        violations.push({
          rule: 'frontmatter-schema',
          message: 'Frontmatter must contain a non-empty "name" field.',
          severity: 'error',
        });
      } else if (!this.KEBAB_CASE_REGEX.test(name.trim())) {
        violations.push({
          rule: 'frontmatter-schema',
          message: `Frontmatter "name" must be kebab-case alphanumeric (lowercase letters, numbers, and hyphens), received: "${name}".`,
          severity: 'error',
        });
      }

      // Check description schema
      const description = frontmatter.description;
      if (!description || typeof description !== 'string' || !description.trim()) {
        violations.push({
          rule: 'frontmatter-schema',
          message: 'Frontmatter must contain a non-empty "description" field.',
          severity: 'error',
        });
      }
    }

    // 4. Tool Whitelist & Tool Extraction Validation
    const permittedSet = this.buildPermittedToolsSet(options);
    const discoveredTools = this.extractMentionedTools(frontmatter, markdownBody);

    for (const tool of discoveredTools) {
      // Check for illegal characters or injection in tool name
      if (
        tool.includes('/') ||
        tool.includes('\\') ||
        tool.includes('..') ||
        tool.includes(';') ||
        tool.includes('|') ||
        tool.includes('&') ||
        tool.includes('$') ||
        tool.includes('`') ||
        tool.includes('"') ||
        tool.includes("'") ||
        tool.includes(' ') ||
        !/^[a-zA-Z0-9_-]+$/.test(tool)
      ) {
        violations.push({
          rule: 'invalid-tool-name',
          message: `Tool name "${tool}" contains illegal characters, directory traversal, or shell injection tokens.`,
          severity: 'error',
          tool,
        });
        continue;
      }

      // Check against permitted whitelist
      if (!permittedSet.has(tool)) {
        const isStrict = options?.rejectOnUnknownTools === true;
        const message = `Unknown or hallucinated tool: "${tool}". Tool is not in permitted whitelist.`;
        violations.push({
          rule: 'tool-whitelist',
          message,
          severity: isStrict ? 'error' : 'warning',
          tool,
        });
        warnings.push(message);
      }
    }

    // 5. Anti-Hero-Agent Dogma Validation
    for (const pattern of this.HERO_AGENT_PATTERNS) {
      const match = markdownBody.match(pattern);
      if (match) {
        const message =
          'Anti-Hero-Agent Dogma violation: skills must not instruct the root orchestrator to directly edit packages/*/src/** (must dispatch isolated subagents instead).';
        violations.push({
          rule: 'anti-hero-agent',
          message,
          severity: 'warning',
          snippet: match[0].trim(),
        });
        warnings.push(message);
        break;
      }
    }

    // 6. Required Sections Validation
    this.validateRequiredSections(markdownBody, options, violations, warnings);

    // 7. Determine Final Status & Validity
    const hasRejection = violations.some(v => v.severity === 'error');
    const hasFlag = violations.some(v => v.severity === 'warning') || warnings.length > 0;

    let status: DogmaValidationStatus = 'passed';
    let valid = true;

    if (hasRejection) {
      status = 'rejected';
      valid = false;
    } else if (hasFlag) {
      status = 'flagged';
      valid = true;
    } else {
      status = 'passed';
      valid = true;
    }

    return {
      valid,
      status,
      violations,
      warnings,
    };
  }

  /**
   * Helper to construct the active set of permitted tools based on options.
   */
  private static buildPermittedToolsSet(options?: DogmaValidationOptions): Set<string> {
    const set = new Set<string>(options?.permittedTools || this.DEFAULT_PERMITTED_TOOLS);
    if (options?.additionalPermittedTools) {
      for (const t of options.additionalPermittedTools) {
        if (t && typeof t === 'string') {
          set.add(t.trim());
        }
      }
    }
    return set;
  }

  /**
   * Extract tools declared or referenced within the skill frontmatter and markdown body.
   */
  private static extractMentionedTools(
    frontmatter: Record<string, unknown>,
    body: string
  ): Set<string> {
    const tools = new Set<string>();

    // 1. From frontmatter tools array or string
    const declaredTools = frontmatter.tools || frontmatter.allowed_tools || frontmatter.permitted_tools;
    if (Array.isArray(declaredTools)) {
      for (const t of declaredTools) {
        if (typeof t === 'string' && t.trim()) {
          tools.add(t.trim());
        }
      }
    } else if (typeof declaredTools === 'string' && declaredTools.trim()) {
      for (const part of declaredTools.split(/[,\s]+/)) {
        if (part.trim()) {
          tools.add(part.trim());
        }
      }
    }

    // 2. Pattern extractions from markdown body
    const toolRegexes: RegExp[] = [
      // Tools formatted as "Execute `tool`" or "Run `tool`" (emitted by WorkflowSkillDistiller)
      /(?:Execute|Run|Call|Using)\s+`([a-zA-Z0-9_\-/.]+)`/gi,
      // "use the `my_tool` tool" or "calling `my_tool` tool"
      /(?:using|use|call|calling|invoke|invoking)\s+(?:the\s+)?`([a-zA-Z0-9_\-\/.]+)`\s+(?:mcp\s+)?tool/gi,
      // "use tool `my_tool`" or "tool: `my_tool`"
      /(?:using|use|call|calling|invoke|invoking)\s+(?:the\s+)?(?:mcp\s+)?tool\s*[:`"']\s*([a-zA-Z0-9_\-\/.]+)/gi,
      // "`my_tool` tool"
      /`([a-zA-Z0-9_\-\/.]+)`\s+(?:mcp\s+)?tool\b/gi,
      // "call MCP tool: `my_tool`"
      /(?:call\s+)?mcp\s+tool(?:\s*call)?[:\s]+`?([a-zA-Z0-9_\-\/.]+)`?/gi,
      // "tool call like `my_tool("
      /tool\s+call\s+like\s+`?([a-zA-Z0-9_\-\/.]+)\(/gi,
      // Bullet list tool item: "- tool: my_tool"
      /^\s*[-*]\s*(?:tool|mcp\s+tool):\s*`?([a-zA-Z0-9_\-\/.]+)`?/gim,
    ];

    for (const regex of toolRegexes) {
      const matches = body.matchAll(regex);
      for (const match of matches) {
        const raw = (match[1] || '').trim();
        if (raw) {
          tools.add(raw);
        }
      }
    }

    // 3. Permitted or Required tools section list
    const toolSectionMatch = body.match(/^#+\s+(?:tools|required\s+tools|permitted\s+tools)[\s\S]*?(?=\n#+|$)/im);
    if (toolSectionMatch) {
      const sectionContent = toolSectionMatch[0];
      const listItems = sectionContent.matchAll(/^\s*[-*]\s*(?:`([^`]+)`|([a-zA-Z0-9_\-\/.]+))/gm);
      for (const match of listItems) {
        const candidate = (match[1] || match[2] || '').trim();
        if (candidate) {
          tools.add(candidate);
        }
      }
    }

    return tools;
  }

  /**
   * Validates presence of required markdown sections (Overview, Procedure, Verification).
   */
  private static validateRequiredSections(
    body: string,
    options: DogmaValidationOptions | undefined,
    violations: DogmaViolation[],
    warnings: string[]
  ): void {
    if (options?.requiredSections && options.requiredSections.length > 0) {
      for (const section of options.requiredSections) {
        const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^#+\\s+${escaped}\\b`, 'im');
        if (!pattern.test(body)) {
          const message = `Missing required section: "${section}".`;
          violations.push({
            rule: 'required-sections',
            message,
            severity: 'warning',
          });
          warnings.push(message);
        }
      }
      return;
    }

    // Default required sections:
    // 1. Overview
    const hasOverview = /^#+\s+(?:overview|description|purpose|summary|about)\b/im.test(body);
    if (!hasOverview) {
      const message = 'Missing required section: "Overview" (e.g. ## Overview).';
      violations.push({
        rule: 'required-sections',
        message,
        severity: 'warning',
      });
      warnings.push(message);
    }

    // 2. Workflow & Procedure
    const hasProcedure = /^#+\s+(?:workflow\s*(&|and)?\s*procedure|procedure|procedures|core\s+procedures|workflow|workflow\s+steps|steps|instructions|execution)\b/im.test(body);
    if (!hasProcedure) {
      const message = 'Missing required section: "Workflow & Procedure" (e.g. ## Workflow & Procedure).';
      violations.push({
        rule: 'required-sections',
        message,
        severity: 'warning',
      });
      warnings.push(message);
    }

    // 3. Verification
    const hasVerification = /^#+\s+(?:verification|verification\s*(&|and)?\s*testing|validation|testing|acceptance\s+criteria)\b/im.test(body);
    if (!hasVerification) {
      const message = 'Missing required section: "Verification" (e.g. ## Verification).';
      violations.push({
        rule: 'required-sections',
        message,
        severity: 'warning',
      });
      warnings.push(message);
    }
  }
}
