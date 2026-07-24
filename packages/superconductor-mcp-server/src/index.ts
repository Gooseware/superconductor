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
  runPipeline,
  FileTelemetryStore,
  TokenUsageReport,
  getDependencySurface
} from "@superconductor/core";

let promptTokens = 0;
let completionTokens = 0;
let stepIndex = 0;
let hasFlushed = false;

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

const workspaceRoot = path.resolve(process.env.SUPERCONDUCTOR_WORKSPACE_ROOT || process.cwd());

/**
 * Resolves and validates a project root path.
 * Follows symlinks then checks the resolved path is within the allowed workspace root.
 * Falls back to the workspace root if the path is outside bounds or cannot be resolved.
 */
function validateProjectRoot(rawRoot?: string): string {
  const candidate = path.resolve(rawRoot || process.cwd());
  try {
    // Resolve symlinks BEFORE the containment check — a symlink inside the
    // workspace pointing to /etc would otherwise pass the lexical path.relative check
    const real = fs.realpathSync(candidate);
    const rel = path.relative(workspaceRoot, real);
    const isWithinAllowed = !rel.startsWith('..') && !path.isAbsolute(rel);
    if (!isWithinAllowed || !fs.statSync(real).isDirectory()) return workspaceRoot;
    return real;
  } catch {
    return workspaceRoot;
  }
}

/**
 * Handles superconductor_get_track_status.
 * Returns stats for a single track when trackId is supplied, otherwise the full registry list.
 */
function handleGetTrackStatus(projectRoot: string, args: Record<string, unknown>): object {
  const tracks = readTrackRegistry(projectRoot);
  const trackId = typeof args.trackId === 'string' ? args.trackId : undefined;
  if (trackId) {
    const stats = getCompletionStats(projectRoot, trackId);
    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(tracks, null, 2) }] };
}

/**
 * Handles superconductor_run_review.
 * Parses targetType/targetValue/depthMode into CLI-style args, resolves the review input,
 * runs the deterministic preflight, and returns the combined result.
 */
function handleRunReview(projectRoot: string, args: Record<string, unknown>): object {
  const reviewArgs: string[] = [];
  if (typeof args.targetType === 'string') {
    if (args.targetType === 'staged') {
      reviewArgs.push('--staged');
    } else if (['branch', 'pr', 'file', 'dir'].includes(args.targetType)) {
      reviewArgs.push(`--${args.targetType}`);
      if (typeof args.targetValue === 'string') reviewArgs.push(args.targetValue);
    }
  }
  if (typeof args.depthMode === 'string') reviewArgs.push(`--${args.depthMode}`);

  const isGitRepo = fs.existsSync(path.join(projectRoot, '.git'));
  const resolvedInput = resolveReviewInput(reviewArgs, isGitRepo);
  const preflight = runDeterministicPreflight(projectRoot);

  return {
    content: [{ type: 'text', text: JSON.stringify({ resolvedInput, preflight }, null, 2) }]
  };
}

export function handleGetAgentContext(projectRoot: string): object {
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

export async function handleRunIntelligence(projectRoot: string): Promise<object> {
  const outputDir = path.join(projectRoot, "superconductor");
  let outData;
  try {
    await runPipeline([], projectRoot, outputDir);
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

export function handleCheckPlanGap(projectRoot: string, args: any): object {
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

export function handleGetDependencySurface(projectRoot: string, args: any): object {
  const depName = (args && typeof args.depName === 'string') ? args.depName : undefined;
  const surface = getDependencySurface(projectRoot, depName);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(surface, null, 2)
      }
    ]
  };
}

// Removed mkResult identity wrapper per adversarial review

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const meta = request.params?._meta;
  if (meta) {
    if (typeof meta.promptTokens === 'number') promptTokens += meta.promptTokens;
    if (typeof meta.completionTokens === 'number') completionTokens += meta.completionTokens;
  }
  stepIndex++;

  const { name, arguments: args } = request.params;
  const projectRoot = validateProjectRoot((args && typeof args.projectRoot === 'string') ? args.projectRoot : undefined);

  switch (name) {
    case "superconductor_get_agent_context":
      return handleGetAgentContext(projectRoot);

    case "superconductor_get_track_status":
      return handleGetTrackStatus(projectRoot, args ?? {});

    case "superconductor_run_intelligence":
      return await handleRunIntelligence(projectRoot);

    case "superconductor_run_review":
      return handleRunReview(projectRoot, args ?? {});

    case "superconductor_check_plan_gap":
      return handleCheckPlanGap(projectRoot, args ?? {});

    case "superconductor_get_dependency_surface":
      return handleGetDependencySurface(projectRoot, args ?? {});

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});


async function flushTelemetry() {
  if (hasFlushed) return;
  hasFlushed = true;
  try {
    const store = new FileTelemetryStore(path.join(workspaceRoot, "superconductor", "telemetry.log"));
    await store.recordUsage({
      trackId: process.env.SUPERCONDUCTOR_TRACK_ID || "unknown",
      subagentId: process.env.SUPERCONDUCTOR_SUBAGENT_ID || "unknown",
      stepIndex,
      promptTokens: Math.max(0, Math.round(promptTokens)),
      completionTokens: Math.max(0, Math.round(completionTokens)),
      timestamp: Date.now()
    });
  } catch (e) {
    console.error("Telemetry flush failed:", e);
  }
}

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // The MCP SDK Transport calls onclose when the connection ends (e.g. parent exits)
  transport.onclose = async () => {
    await flushTelemetry();
    process.exit(0);
  };
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    await flushTelemetry();
    process.exit(0);
  });
});

run().catch((error) => {
  console.error("Superconductor MCP Server error:", error);
  process.exit(1);
});
