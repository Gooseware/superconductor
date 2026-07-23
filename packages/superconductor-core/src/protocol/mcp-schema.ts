export interface McpToolDeclaration {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const SUPERCONDUCTOR_MCP_TOOLS: McpToolDeclaration[] = [
  {
    name: 'superconductor_get_agent_context',
    description: 'Retrieves the standardized Superconductor agent context bundle including tool registry status, active tracks, and intelligence snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Absolute path to project root directory'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'superconductor_run_intelligence',
    description: 'Executes the privacy-first offline codebase intelligence pipeline to produce structured ecosystem analysis artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target repository directory path'
        },
        brownfield: {
          type: 'boolean',
          description: 'Enable brownfield standalone analysis mode'
        },
        report: {
          type: 'boolean',
          description: 'Generate repository health report markdown'
        }
      }
    }
  },
  {
    name: 'superconductor_get_track_status',
    description: 'Lists all tracks in the tracks registry with completion percentage and current execution state.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Absolute path to project root'
        },
        trackId: {
          type: 'string',
          description: 'Optional specific track ID filter'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'superconductor_run_review',
    description: 'Executes the multi-agent code review panel (deterministic preflight, coverage manifest, residual pass, cascade deferral gate).',
    inputSchema: {
      type: 'object',
      properties: {
        targetType: {
          type: 'string',
          enum: ['staged', 'branch', 'pr', 'file', 'dir', 'default']
        },
        targetValue: {
          type: 'string'
        },
        depthMode: {
          type: 'string',
          enum: ['fast', 'deep', 'full']
        }
      }
    }
  },
  {
    name: 'superconductor_check_plan_gap',
    description: 'Cross-references git diff against track acceptance criteria to identify uncovered implementation gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string'
        },
        trackId: {
          type: 'string'
        },
        changedFiles: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['projectRoot', 'trackId', 'changedFiles']
    }
  },
  {
    name: 'superconductor_run_abi_retrospective',
    description: 'Automates the Always-Be-Improving retrospective loop by extracting new failure patterns from review artifacts into adversarial-audit.md.',
    inputSchema: {
      type: 'object',
      properties: {
        trackId: {
          type: 'string'
        },
        artifactsDir: {
          type: 'string'
        }
      },
      required: ['trackId']
    }
  }
];
