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
  getDependencySurface,
  IntelligenceSnapshotReader
} from "@superconductor/core";

import { GraphCache } from "./services/GraphCache.js";
import { TrackStateManager } from "./services/TrackStateManager.js";

class TelemetrySession {
  private promptTokens = 0;
  private completionTokens = 0;
  private stepIndex = 0;
  private hasFlushed = false;
  private store: FileTelemetryStore;
  constructor(private root: string) {
    this.store = new FileTelemetryStore(path.join(this.root, "superconductor", "telemetry.log"));
  }
  public addTokens(prompt: any, completion: any) {
    if (typeof prompt === 'number' && Number.isInteger(prompt) && prompt > 0) {
      this.promptTokens += prompt;
    }
    if (typeof completion === 'number' && Number.isInteger(completion) && completion > 0) {
      this.completionTokens += completion;
    }
  }
  public incrementStep() { this.stepIndex++; }
  public async flush(retries = 3) {
    if (this.hasFlushed) return;
    for (let i = 0; i < retries; i++) {
      try {
        await this.store.recordUsage({
          trackId: (process.env.SUPERCONDUCTOR_TRACK_ID || "unknown").replace(/[^a-zA-Z0-9_-]/g, ""),
          subagentId: (process.env.SUPERCONDUCTOR_SUBAGENT_ID || "unknown").replace(/[^a-zA-Z0-9_-]/g, ""),
          stepIndex: this.stepIndex,
          promptTokens: this.promptTokens,
          completionTokens: this.completionTokens,
          timestamp: Date.now()
        });
        this.hasFlushed = true;
        return;
      } catch (e) {
        if (i === retries - 1) {
          console.error("Telemetry flush failed after retries:", e instanceof Error ? e.message : String(e));
        }
      }
    }
  }
}
let telemetrySession: TelemetrySession;

const server = new Server(
  {
    name: "superconductor-kernel",
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
    tools: [
      ...SUPERCONDUCTOR_MCP_TOOLS,
      {
        name: "kernel_graph_get_node",
        description: "Get a node from the graph",
        inputSchema: { type: "object", properties: { node_id: { type: "string" } }, required: ["node_id"] }
      },
      {
        name: "kernel_graph_get_neighbors",
        description: "Get neighbors of a node",
        inputSchema: { type: "object", properties: { node_id: { type: "string" }, max_depth: { type: "number" } }, required: ["node_id", "max_depth"] }
      },
      {
        name: "kernel_graph_shortest_path",
        description: "Get shortest path between two nodes",
        inputSchema: { type: "object", properties: { source: { type: "string" }, target: { type: "string" } }, required: ["source", "target"] }
      },
      {
        name: "kernel_intelligence_get_hotspots",
        description: "Get top hotspots based on a metric",
        inputSchema: { type: "object", properties: { metric: { type: "string", enum: ["churn", "complexity", "pagerank"] } }, required: ["metric"] }
      },
      {
        name: "kernel_intelligence_get_dependency_graph",
        description: "Get dependency graph for a community",
        inputSchema: { type: "object", properties: { community_id: { type: "string" } }, required: ["community_id"] }
      },
      {
        name: "kernel_policy_get_mode",
        description: "Get current kernel policy mode",
        inputSchema: { type: "object", properties: {} }
      }
    ]
  };
});

const workspaceRoot = path.resolve(process.env.SUPERCONDUCTOR_WORKSPACE_ROOT || process.cwd());
telemetrySession = new TelemetrySession(workspaceRoot);

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
    const intelDir = path.join(outputDir, "intelligence");
    const loaded = IntelligenceSnapshotReader.load(intelDir, projectRoot);
    if (!loaded) {
      throw new Error("Failed to load intelligence snapshot");
    }
    
    // Convert maps to objects or arrays before returning for JSON serialization
    outData = {
      driftState: loaded.driftState,
      driftBanner: loaded.driftBanner,
      snapshotAge: loaded.snapshotAge,
      commitsBehind: loaded.commitsBehind,
      hotspotMap: Object.fromEntries(loaded.hotspotMap.entries()),
      testGapMap: Object.fromEntries(loaded.testGapMap.entries()),
      sastFindings: Object.fromEntries(loaded.sastFindings.entries()),
      fanOutMap: loaded.fanOutMap ? Object.fromEntries(loaded.fanOutMap.entries()) : {},
      couplingMap: loaded.couplingMap ? Object.fromEntries(loaded.couplingMap.entries()) : {}
    };
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
    telemetrySession.addTokens(meta.promptTokens, meta.completionTokens);
  }
  telemetrySession.incrementStep();

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

    case "kernel_graph_get_node": {
      const cache = new GraphCache(projectRoot);
      const res = cache.getNode((args as any).node_id as string);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    case "kernel_graph_get_neighbors": {
      const cache = new GraphCache(projectRoot);
      const res = cache.getNeighbors((args as any).node_id as string, (args as any).max_depth as number);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    case "kernel_graph_shortest_path": {
      const cache = new GraphCache(projectRoot);
      const res = cache.shortestPath((args as any).source as string, (args as any).target as string);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    case "kernel_intelligence_get_hotspots": {
      const cache = new GraphCache(projectRoot);
      const res = cache.getHotspots((args as any).metric as "churn" | "complexity" | "pagerank");
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    case "kernel_intelligence_get_dependency_graph": {
      const cache = new GraphCache(projectRoot);
      const res = cache.getDependencyGraph((args as any).community_id as string);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
    case "kernel_policy_get_mode": {
      const sm = new TrackStateManager(projectRoot);
      const res = sm.getMode();
      return { content: [{ type: "text", text: JSON.stringify({ mode: res }, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});


async function flushTelemetry() {
  await telemetrySession.flush();
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
  console.error("Superconductor MCP Server error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
