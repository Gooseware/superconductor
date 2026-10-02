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
  },
  {
    name: 'superconductor_get_dependency_surface',
    description: 'Reads the usage heatmap from 08_dependency_surface.json to determine function surface and coupling. Can query the entire surface or a specific dependency.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string'
        },
        depName: {
          type: 'string',
          description: 'Optional dependency file path to query a specific score.'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'wireframe_crawl_project',
    description: 'Crawl project routes, capture multi-viewport screenshots, record continuous journey video, probe interactive affordances/modals safely, and generate interactive wireframe flow boards.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Absolute path to project root directory'
        },
        baseUrl: {
          type: 'string',
          description: 'Optional running dev server base URL'
        },
        outputDir: {
          type: 'string',
          description: 'Optional directory path where wireframe board and manifest will be emitted'
        },
        profile: {
          type: 'string',
          description: 'Optional stored auth profile name to hydrate browser context'
        },
        scenarios: {
          type: 'string',
          description: 'Optional scenario file path defining dynamic goal execution'
        },
        recordVideo: {
          type: 'boolean',
          description: 'Whether to record continuous journey video (default: true)'
        }
      },
      required: ['projectRoot']
    }
  },
  {
    name: 'auth_create_profile',
    description: 'Starts a Remote Human Auth Bridge session streaming screencast VNC to capture authentication cookies & state for a profile.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Login target URL requiring authentication'
        },
        profileName: {
          type: 'string',
          description: 'Name of the authentication profile to create or update'
        },
        port: {
          type: 'number',
          description: 'Optional port for the Screencast Web VNC server (default: 4455)'
        }
      },
      required: ['url', 'profileName']
    }
  },
  {
    name: 'auth_list_profiles',
    description: 'Lists all stored browser authentication profiles available in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Optional project root directory'
        }
      }
    }
  },
  {
    name: 'browser_scrape_data',
    description: 'Scrapes web content using DualScraper: cleans HTML into high-density Markdown or extracts structured records using schema.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Target page URL to scrape'
        },
        mode: {
          type: 'string',
          enum: ['read', 'scrape'],
          description: 'Scrape mode: read for clean markdown, scrape for schema-validated structured data'
        },
        schema: {
          type: 'object',
          description: 'Optional structured schema definition for extraction'
        },
        selector: {
          type: 'string',
          description: 'Optional container CSS selector'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_distill_theme',
    description: 'Distills design cues, WCAG-contrast palettes, typography scales, radii, and shadows from a URL into Design OS theme tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Target URL to extract theme cues from'
        },
        name: {
          type: 'string',
          description: 'Optional theme name identifier'
        }
      },
      required: ['url']
    }
  }
];
