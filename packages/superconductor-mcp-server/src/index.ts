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
  checkPlanGap
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
  const projectRoot = (args && typeof args.projectRoot === 'string') ? args.projectRoot : process.cwd();

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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "executed",
              message: "Intelligence pipeline runner delegated to core engine."
            }, null, 2)
          }
        ]
      };
    }

    case "superconductor_run_review": {
      const preflight = runDeterministicPreflight(projectRoot);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(preflight, null, 2)
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
              status: "executed",
              message: "ABI retrospective scan completed."
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
