import path from "node:path";
import fs from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getAgentContext,
  SUPERCONDUCTOR_MCP_TOOLS,
  readTrackRegistry,
  getCompletionStats,
  runDeterministicPreflight,
  aggregateCoverageManifests,
  aggregateFindings,
  runCascadeDeferralGate,
  generateTokenReport,
  checkPlanGap,
  resolveReviewInput,
  runPipeline
} from "@superconductor/core";

const server = new Server(
  {
    name: "superconductor-mcp-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: SUPERCONDUCTOR_MCP_TOOLS
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;
  const rawProjectRoot = (args && typeof args.projectRoot === 'string') ? args.projectRoot : process.cwd();
  const allowedRoot = path.resolve(process.env.SUPERCONDUCTOR_WORKSPACE_ROOT || process.cwd());
  let projectRoot = path.resolve(rawProjectRoot);
  try {
    const rel = path.relative(allowedRoot, projectRoot);
    const isWithinAllowed = !rel.startsWith('..') && !path.isAbsolute(rel);
    if (!isWithinAllowed || !fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
      projectRoot = allowedRoot;
    }
  } catch {
    projectRoot = allowedRoot;
  }

  switch (name) {
    case "superconductor_get_agent_context": {
      const context = getAgentContext(projectRoot);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(context, null, 2)
          }
        ]
      };
    }

    case "superconductor_get_track_status": {
      const tracks = readTrackRegistry(projectRoot);
      const trackId = args && typeof args.trackId === 'string' ? args.trackId : undefined;

      if (trackId) {
        const stats = getCompletionStats(projectRoot, trackId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tracks, null, 2)
          }
        ]
      };
    }

    case "superconductor_run_intelligence": {
      const outputDir = path.join(projectRoot, "superconductor");
      let outData;
      try {
        runPipeline([], projectRoot, outputDir);
        const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, "intelligence", "00_manifest.json"), "utf8"));
        outData = manifest;
      } catch (e: any) {
        outData = { error: e.message };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(outData, null, 2)
          }
        ]
      };
    }

    case "superconductor_run_review": {
      const reviewArgs: string[] = [];
      if (args && typeof args.targetType === 'string') {
        if (args.targetType === 'staged') {
          reviewArgs.push('--staged');
        } else if (['branch', 'pr', 'file', 'dir'].includes(args.targetType)) {
          reviewArgs.push(`--${args.targetType}`);
          if (typeof args.targetValue === 'string') {
            reviewArgs.push(args.targetValue);
          }
        }
      }
      if (args && typeof args.depthMode === 'string') {
        reviewArgs.push(`--${args.depthMode}`);
      }

      const isGitRepo = fs.existsSync(path.join(projectRoot, '.git'));
      const resolvedInput = resolveReviewInput(reviewArgs, isGitRepo);
      const preflight = runDeterministicPreflight(projectRoot);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              resolvedInput,
              preflight
            }, null, 2)
          }
        ]
      };
    }

    case "superconductor_check_plan_gap": {
      const trackId = (args && typeof args.trackId === 'string') ? args.trackId : '';
      const changedFiles = (args && Array.isArray(args.changedFiles)) ? (args.changedFiles as string[]) : [];
      const report = checkPlanGap(projectRoot, trackId, changedFiles);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(report, null, 2)
          }
        ]
      };
    }

    case "superconductor_run_abi_retrospective": {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "NOT_IMPLEMENTED",
              message: "This tool is scheduled for implementation in a future track..."
            }, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((error) => {
  console.error("Superconductor MCP Server error:", error);
  process.exit(1);
});
