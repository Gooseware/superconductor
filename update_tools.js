const fs = require('fs');

const path = 'packages/superconductor-kernel/src/index.ts';
let content = fs.readFileSync(path, 'utf8');

const importStatement = `import { TrackStateManager } from "./services/TrackStateManager.js";\n`;
if (!content.includes('TrackStateManager')) {
  content = content.replace('import { GraphCache } from "./services/GraphCache.js";', 'import { GraphCache } from "./services/GraphCache.js";\n' + importStatement);
}

const instances = `
const graphCache = new GraphCache();
const trackStateManager = new TrackStateManager();
`;

if (!content.includes('new GraphCache()')) {
  content = content.replace('const syncManager = new SyncManager', instances + '\nconst syncManager = new SyncManager');
}

const newTools = `
      {
        name: "kernel_graph_get_node",
        description: "Gets a node from the intelligence graph",
        inputSchema: {
          type: "object",
          properties: {
            node_id: { type: "string" }
          },
          required: ["node_id"]
        }
      },
      {
        name: "kernel_graph_get_neighbors",
        description: "Gets neighbors of a node from the intelligence graph",
        inputSchema: {
          type: "object",
          properties: {
            node_id: { type: "string" },
            max_depth: { type: "number" }
          },
          required: ["node_id", "max_depth"]
        }
      },
      {
        name: "kernel_graph_shortest_path",
        description: "Gets shortest path between two nodes",
        inputSchema: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" }
          },
          required: ["source", "target"]
        }
      },
      {
        name: "kernel_intelligence_get_hotspots",
        description: "Gets hotspots based on metric",
        inputSchema: {
          type: "object",
          properties: {
            metric: { type: "string", enum: ["churn", "complexity", "pagerank"] }
          },
          required: ["metric"]
        }
      },
      {
        name: "kernel_intelligence_get_dependency_graph",
        description: "Gets dependency graph for a community",
        inputSchema: {
          type: "object",
          properties: {
            community_id: { type: "string" }
          },
          required: ["community_id"]
        }
      },
      {
        name: "kernel_policy_get_mode",
        description: "Gets current track state mode",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
`;

if (!content.includes('kernel_graph_get_node')) {
  content = content.replace('      {', newTools + '      {');
}


const newToolHandlers = `
  if (name === "kernel_graph_get_node") {
    const { node_id } = z.object({ node_id: z.string() }).parse(args);
    const node = graphCache.getNode(node_id);
    return { content: [{ type: "text", text: JSON.stringify(node || null, null, 2) }] };
  }

  if (name === "kernel_graph_get_neighbors") {
    const { node_id, max_depth } = z.object({ node_id: z.string(), max_depth: z.number() }).parse(args);
    const neighbors = graphCache.getNeighbors(node_id, Math.min(max_depth, 10));
    return { content: [{ type: "text", text: JSON.stringify(neighbors, null, 2) }] };
  }

  if (name === "kernel_graph_shortest_path") {
    const { source, target } = z.object({ source: z.string(), target: z.string() }).parse(args);
    const path = graphCache.shortestPath(source, target);
    return { content: [{ type: "text", text: JSON.stringify(path || [], null, 2) }] };
  }

  if (name === "kernel_intelligence_get_hotspots") {
    const { metric } = z.object({ metric: z.enum(["churn", "complexity", "pagerank"]) }).parse(args);
    // Mock implementation for getting hotspots
    const data = graphCache.load();
    const sorted = [...data.nodes].sort((a, b) => {
      const valA = a.metadata?.[metric] || 0;
      const valB = b.metadata?.[metric] || 0;
      return valB - valA;
    }).slice(0, 10);
    return { content: [{ type: "text", text: JSON.stringify(sorted, null, 2) }] };
  }

  if (name === "kernel_intelligence_get_dependency_graph") {
    const { community_id } = z.object({ community_id: z.string() }).parse(args);
    // Mock implementation for dependency graph
    const data = graphCache.load();
    const nodes = data.nodes.filter(n => n.metadata?.community_id === community_id);
    return { content: [{ type: "text", text: JSON.stringify(nodes, null, 2) }] };
  }

  if (name === "kernel_policy_get_mode") {
    const mode = trackStateManager.getMode();
    return { content: [{ type: "text", text: mode }] };
  }
`;

if (!content.includes('if (name === "kernel_graph_get_node")')) {
  content = content.replace('throw new Error("Tool not found");', newToolHandlers + '\n  throw new Error("Tool not found");');
}

fs.writeFileSync(path, content);
