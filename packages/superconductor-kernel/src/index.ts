import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ConfigService, type Config } from "./services/ConfigService.js";
import { SyncManager } from "./services/SyncManager.js";
import { GraphCache } from "./services/GraphCache.js";
import { TrackStateManager } from "./services/TrackStateManager.js";

import { z } from "zod";
import { createClient } from "@libsql/client";
import { GitService } from "./services/GitService.js";
import { RegistryService } from "./services/RegistryService.js";
import { InstallerService } from "./services/InstallerService.js";
import { DogmaService } from "./services/DogmaService.js";
import { PublishService } from "./services/PublishService.js";
import { CentralizedPublishService } from "./services/CentralizedPublishService.js";
import { fileURLToPath } from "url";
import os from "os";
import path from "path";
import fs from "fs";

const HOME_DIR = os.homedir();
const DESIGN_OS_DIR = path.join(HOME_DIR, ".design_os");
const DB_PATH = path.join(DESIGN_OS_DIR, "design-os.sqlite");
const CACHE_DIR = path.join(DESIGN_OS_DIR, "cache");
const DEFAULT_REGISTRY_PATH = path.join(DESIGN_OS_DIR, "registry");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(PACKAGE_ROOT, "../..");
const OLD_REGISTRY_PATH = path.resolve(PROJECT_ROOT, "packages/ui-kit-registry");

// One-time Migration
if (fs.existsSync(OLD_REGISTRY_PATH) && !fs.existsSync(DEFAULT_REGISTRY_PATH)) {
  console.log(`[Migration] Moving registry from ${OLD_REGISTRY_PATH} to ${DEFAULT_REGISTRY_PATH}`);
  fs.mkdirSync(path.dirname(DEFAULT_REGISTRY_PATH), { recursive: true });
  fs.renameSync(OLD_REGISTRY_PATH, DEFAULT_REGISTRY_PATH);
} else if (!fs.existsSync(DEFAULT_REGISTRY_PATH)) {
  fs.mkdirSync(DEFAULT_REGISTRY_PATH, { recursive: true });
}

const db = createClient({
  url: `file:${DB_PATH}`,
});

const gitService = new GitService(CACHE_DIR);
const installerService = new InstallerService(db, PROJECT_ROOT);
const dogmaService = new DogmaService();

let currentRegistryPath = DEFAULT_REGISTRY_PATH;
let registryService = new RegistryService(db, currentRegistryPath);
let publishService = new PublishService(currentRegistryPath);
let centralizedPublishService = new CentralizedPublishService(currentRegistryPath);

function updateRegistryPath(newPath: string) {
  currentRegistryPath = newPath;
  publishService = new PublishService(currentRegistryPath);
  centralizedPublishService = new CentralizedPublishService(currentRegistryPath);
  registryService = new RegistryService(db, currentRegistryPath);
  console.log(`[Registry] Switched active registry to: ${currentRegistryPath}`);
}

async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT,
      config TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT,
      url TEXT,
      type TEXT,
      characteristics TEXT,
      last_synced_at TEXT,
      etag TEXT
    )
  `);

  try { await db.execute("ALTER TABLE sources ADD COLUMN etag TEXT"); } catch (e) { }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS registry_items (
      id TEXT PRIMARY KEY,
      name TEXT,
      family TEXT,
      variant TEXT,
      intent_tags TEXT,
      description TEXT,
      source_id TEXT,
      type TEXT,
      complexity TEXT,
      vetted INTEGER DEFAULT 0,
      FOREIGN KEY(source_id) REFERENCES sources(id)
    )
  `);

  try { await db.execute("ALTER TABLE registry_items ADD COLUMN type TEXT"); } catch (e) { }
  try { await db.execute("ALTER TABLE registry_items ADD COLUMN complexity TEXT"); } catch (e) { }
  try { await db.execute("ALTER TABLE registry_items ADD COLUMN vetted INTEGER DEFAULT 0"); } catch (e) { }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS installed_components (
      id TEXT PRIMARY KEY,
      component_id TEXT,
      local_path TEXT,
      version_hash TEXT,
      has_local_modifications INTEGER DEFAULT 0,
      FOREIGN KEY(component_id) REFERENCES registry_items(id)
    )
  `);
}

const server = new Server(
  {
    name: "superconductor-kernel",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const SetThemeSchema = z.record(z.string(), z.any());

const AnalyzeInspirationSchema = z.object({
  imageUrl: z.string().url().optional(),
  description: z.string().optional(),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [

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
      {
        name: "set_theme",
        description: "Updates the design theme tokens in the database",
        inputSchema: {
          type: "object",
          properties: {
            primary: { type: "string", description: "Primary HSL (e.g. '142 71% 45%')" },
            foreground: { type: "string", description: "Foreground HSL" },
            background: { type: "string", description: "Background HSL" },
            radius: { type: "string", description: "Border radius (e.g. '0.5rem')" },
            border: { type: "string", description: "Border HSL" },
            fontSans: { type: "string", description: "Sans-serif font name" },
            fontSerif: { type: "string", description: "Serif font name" },
          },
        },
      },
      {
        name: "analyze_visual_inspiration",
        description: "Analyzes an image or description to suggest design tokens",
        inputSchema: {
          type: "object",
          properties: {
            imageUrl: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      {
        name: "registry_sync",
        description: "Syncs the component registry from a remote repository",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Remote repository URL" },
            branch: { type: "string", description: "Branch to sync from" },
          },
          required: ["url"],
        },
      },
      {
        name: "registry_recommend",
        description:
          "Recommends components based on a design context or intent",
        inputSchema: {
          type: "object",
          properties: {
            context: {
              type: "string",
              description: "The design context or intent (e.g., 'high interactivity card')",
            },
          },
          required: ["context"],
        },
      },
      {
        name: "registry_install",
        description: "Installs a component variant from the registry",
        inputSchema: {
          type: "object",
          properties: {
            family: {
              type: "string",
              description: "Component family (e.g., 'button')",
            },
            variant: {
              type: "string",
              description: "Component variant (e.g., 'base')",
            },
            sourceUrl: {
              type: "string",
              description: "Source repository URL",
            },
            targetPath: {
              type: "string",
              description: "Optional target path override",
            },
          },
          required: ["family", "variant", "sourceUrl"],
        },
      },
      {
        name: "registry_validate_file",
        description:
          "Validates a component file against Design OS dogma standards",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the component file" },
          },
          required: ["path"],
        },
      },
      {
        name: "registry_fix_dogma",
        description: "Automatically fixes Dogma violations (like hardcoded hex colors) in a file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to the component file" },
          },
          required: ["path"],
        },
      },
      {
        name: "registry_propose_publish",
        description:
          "Starts the multi-step publishing process for a component",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Local path to the component file",
            },
            family: {
              type: "string",
              description: "Component family (e.g., 'card')",
            },
            variant: {
              type: "string",
              description: "Variant name (e.g., '3d-hover')",
            },
            type: {
              type: "string",
              enum: ["atom", "molecule", "organism", "page", "layout", "form", "util"],
              description: "The architectural type of the component",
            },
          },
          required: ["path", "family", "variant", "type"],
        },
      },
      {
        name: "registry_finalize_publish",
        description: "Completes the publishing process with metadata",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            family: { type: "string" },
            variant: { type: "string" },
            type: {
              type: "string",
              enum: ["atom", "molecule", "organism", "page", "layout", "form", "util"],
            },
            description: { type: "string" },
            intent: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            dependencies: { type: "array", items: { type: "string" } },
          },
          required: ["path", "family", "variant", "type", "description", "intent"],
        },
      },
      {
        name: "publish_vetted_component",
        description: "Publishes a vetted component with multiple files and comments to the centralized registry",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  content: { type: "string" }
                },
                required: ["path", "content"]
              }
            },
            metadata: {
              type: "object",
              properties: {
                name: { type: "string" },
                family: { type: "string" },
                variant: { type: "string" },
                type: { type: "string", enum: ["atom", "molecule", "organism", "page", "layout", "form", "util"] },
                description: { type: "string" },
                intent: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                dependencies: { type: "array", items: { type: "string" } },
                comments: { type: "array", items: { type: "string" } }
              },
              required: ["name", "family", "variant", "type", "description", "intent"]
            },
            registryName: { type: "string", description: "Optional name of the target registry from config" }
          },
          required: ["files", "metadata"]
        }
      },
      {
        name: "add_component_comment",
        description: "Adds a comment to a specific component variant in the registry",
        inputSchema: {
          type: "object",
          properties: {
            family: { type: "string" },
            variant: { type: "string" },
            comment: { type: "string" },
            registryName: { type: "string", description: "Optional name of the target registry" }
          },
          required: ["family", "variant", "comment"]
        }
      },
      {
        name: "registry_list_blocks",
        description: "Lists all available opinion blocks in the registry",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "registry_get_block_wiring",
        description: "Retrieves the WIRING.md instructions for a specific block",
        inputSchema: {
          type: "object",
          properties: {
            blockName: { type: "string", description: "The name of the block (e.g. 'auth-sso')" },
          },
          required: ["blockName"],
        },
      },
      {
        name: "registry_remove",
        description: "Removes a component variant from the registry",
        inputSchema: {
          type: "object",
          properties: {
            family: { type: "string" },
            variant: { type: "string" },
          },
          required: ["family", "variant"],
        },
      },
      {
        name: "add_registry",
        description: "Adds a new registry repository to the configuration",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            type: { type: "string", enum: ["git", "url"] },
            isDefault: { type: "boolean" },
            localPath: { type: "string" }
          },
          required: ["name", "url", "type"]
        }
      },
      {
        name: "list_registries",
        description: "Lists all configured registries",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "switch_active_registry",
        description: "Switches the active registry for publishing",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" }
          },
          required: ["name"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "set_theme") {
    const newConfig = SetThemeSchema.parse(args);
    const now = new Date().toISOString();

    const existingResult = await db.execute({
      sql: "SELECT config FROM themes WHERE id = ?",
      args: ["current"],
    });

    let mergedConfig = newConfig;
    if (existingResult.rows.length > 0) {
      const existingConfigStr = existingResult.rows[0].config as string;
      if (existingConfigStr) {
        try {
          const parsedExisting = JSON.parse(existingConfigStr);
          mergedConfig = { ...parsedExisting, ...newConfig };
        } catch (e) { }
      }
    }

    const configStr = JSON.stringify(mergedConfig);

    await db.execute({
      sql: `
        INSERT INTO themes (id, name, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          config = excluded.config,
          updated_at = excluded.updated_at
      `,
      args: ["current", "Current Theme", configStr, now, now],
    });

    return {
      content: [{ type: "text", text: `Theme updated successfully.` }],
    };
  }

  if (name === "analyze_visual_inspiration") {
    throw new Error("analyze_visual_inspiration is not fully implemented in the current kernel version.");
  }

  if (name === "registry_sync") {
    const config = ConfigService.getConfig();
    const results = [];
    for (const registry of config.registries) {
      const sourceId = Buffer.from(registry.url).toString("base64url").slice(0, 12);
      try {
        await db.execute({
          sql: `
            INSERT INTO sources (id, name, url, type, characteristics) 
            VALUES (?, ?, ?, ?, ?) 
            ON CONFLICT(id) DO UPDATE SET characteristics = excluded.characteristics
          `,
          args: [sourceId, registry.name, registry.url, registry.type, JSON.stringify(registry.characteristics)],
        });
        if (registry.type === "git") {
          const localPath = registry.localPath || await gitService.sync(registry.url);
          await registryService.syncFromLocalPath(sourceId, localPath);
        } else if (registry.type === "url") {
          await registryService.syncFromHttp(sourceId, registry.url);
        }
        results.push(`Synced ${registry.name} successfully.`);
      } catch (err: any) {
        results.push(`Failed to sync ${registry.name}: ${err.message}`);
      }
    }
    return { content: [{ type: "text", text: results.join("\n") }] };
  }

  if (name === "registry_recommend") {
    const { context } = z.object({ context: z.string() }).parse(args);
    const tokens = context.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    // Build dynamic query based on number of tokens
    let whereClauses = [];
    let queryArgs = [];
    
    for (const token of tokens) {
      whereClauses.push(`(
        r.description LIKE ? 
        OR r.intent_tags LIKE ? 
        OR r.family LIKE ? 
        OR s.name LIKE ? 
        OR s.characteristics LIKE ?
        OR r.complexity LIKE ?
      )`);
      const likeToken = `%${token}%`;
      queryArgs.push(likeToken, likeToken, likeToken, likeToken, likeToken, likeToken);
    }

    const sql = `
      SELECT r.*, s.characteristics as source_characteristics, s.name as source_name 
      FROM registry_items r
      JOIN sources s ON r.source_id = s.id
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
    `;

    const result = await db.execute({ sql, args: queryArgs });

    const rows = result.rows.map(row => {
      let score = 0;
      const chars = row.source_characteristics ? JSON.parse(row.source_characteristics as string) : [];
      const tags = row.intent_tags ? JSON.parse(row.intent_tags as string) : [];
      const sourceName = (row.source_name as string).toLowerCase();
      const family = (row.family as string).toLowerCase();
      const description = (row.description as string).toLowerCase();

      // 1. Vetted Priority (Massive Boost)
      if (row.vetted === 1) score += 50;

      for (const token of tokens) {
        // 2. Exact/Partial Family Match (Very High)
        if (family === token) score += 40;
        else if (family.includes(token)) score += 15;

        // 3. Tag Matches (High)
        if (tags.some((t: string) => t.toLowerCase() === token)) score += 25;
        else if (tags.some((t: string) => t.toLowerCase().includes(token))) score += 10;

        // 4. Source/Characteristic Matches (Medium)
        if (sourceName.includes(token)) score += 10;
        if (chars.some((c: string) => c.toLowerCase() === token)) score += 15;

        // 5. Complexity Match (Contextual)
        if (row.complexity && (row.complexity as string).toLowerCase() === token) score += 20;

        // 6. Description Match (Low)
        if (description.includes(token)) score += 5;
      }
      
      return { ...row, score, source_characteristics: chars, intent_tags: tags };
    });

    rows.sort((a, b) => b.score - a.score);

    return {
      content: [{ type: "text", text: JSON.stringify(rows.slice(0, 10), null, 2) }],
    };
  }

  if (name === "registry_install") {
    const { family, variant, sourceUrl, targetPath } = z
      .object({ family: z.string(), variant: z.string(), sourceUrl: z.string(), targetPath: z.string().optional() })
      .parse(args);
    const sourceId = Buffer.from(sourceUrl).toString("base64url").slice(0, 12);
    const localRegistryPath = path.join(CACHE_DIR, sourceId);
    const destDir = await installerService.install(localRegistryPath, sourceId, family, variant, targetPath);
    return { content: [{ type: "text", text: `Successfully installed ${family}/${variant} to ${destDir}` }] };
  }

  if (name === "registry_validate_file") {
    const { path: filePath } = z.object({ path: z.string() }).parse(args);
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
    const result = await dogmaService.validate(absolutePath);
    
    let text = JSON.stringify(result, null, 2);
    if (result.suggestions && result.suggestions.length > 0) {
      text += `\n\nSUGGESTIONS:\n- ${result.suggestions.join('\n- ')}`;
    }

    return { content: [{ type: "text", text }] };
  }

  if (name === "registry_fix_dogma") {
    const { path: filePath } = z.object({ path: z.string() }).parse(args);
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
    const result = await dogmaService.fix(absolutePath);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  if (name === "registry_propose_publish") {
    const { path: filePath, family, variant, type } = z
      .object({ path: z.string(), family: z.string(), variant: z.string(), type: z.enum(["atom", "molecule", "organism", "page", "layout", "form", "util"]) })
      .parse(args);
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
    const validation = await dogmaService.validate(absolutePath);
    if (!validation.success) {
      return { content: [{ type: "text", text: `REJECTED: Component does not meet dogma standards.\n${validation.errors.join("\n")}` }] };
    }
    return { content: [{ type: "text", text: `Code validation passed for ${type} ${family}/${variant}. Call 'registry_finalize_publish' to finish.` }] };
  }

  if (name === "registry_finalize_publish") {
    const data = z
      .object({
        path: z.string(), family: z.string(), variant: z.string(),
        type: z.enum(["atom", "molecule", "organism", "page", "layout", "form", "util"]),
        description: z.string(), intent: z.string(),
        tags: z.array(z.string()).optional().default([]),
        dependencies: z.array(z.string()).optional().default([])
      })
      .parse(args);
    const absolutePath = path.isAbsolute(data.path) ? data.path : path.resolve(PROJECT_ROOT, data.path);
    const publishResult = await publishService.publish(absolutePath, data.family, data.variant, {
      type: data.type, description: data.description, intent: data.intent, tags: data.tags, dependencies: data.dependencies,
    });

    // Re-sync active registry to database
    await db.execute({ sql: "INSERT INTO sources (id, name, url, type, characteristics) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", args: ["active-registry", "Active Registry", "local://active", "git", "[]"] });
    await registryService.syncFromLocalPath("active-registry", currentRegistryPath);

    return { 
      content: [{ 
        type: "text", 
        text: `Successfully published ${publishResult.path} to ${currentRegistryPath}. Commit: ${publishResult.commitHash}${publishResult.pushed ? ' (Pushed)' : ' (Local Only)'}` 
      }] 
    };
  }

  if (name === "publish_vetted_component") {
    const { registryName, ...payload } = z.object({
      registryName: z.string().optional(),
      files: z.array(z.object({ path: z.string(), content: z.string() })),
      metadata: z.any()
    }).parse(args);

    if (registryName) {
      const config = ConfigService.getConfig();
      const registry = config.registries.find(r => r.name === registryName);
      if (registry && registry.localPath) {
        updateRegistryPath(registry.localPath);
      } else {
         return { content: [{ type: "text", text: `Error: Registry ${registryName} not found or has no localPath.` }] };
      }
    }

    const result = await centralizedPublishService.publish(payload as any);
    
    // Re-sync
    await db.execute({ sql: "INSERT INTO sources (id, name, url, type, characteristics) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", args: ["active-registry", "Active Registry", "local://active", "git", "[]"] });
    await registryService.syncFromLocalPath("active-registry", currentRegistryPath);

    return {
      content: [{ type: "text", text: `Successfully published to ${currentRegistryPath}.` }]
    };
  }

  if (name === "add_component_comment") {
    const { family, variant, comment, registryName } = z.object({
      family: z.string(),
      variant: z.string(),
      comment: z.string(),
      registryName: z.string().optional()
    }).parse(args);
    
    if (registryName) {
      const config = ConfigService.getConfig();
      const registry = config.registries.find(r => r.name === registryName);
      if (registry && registry.localPath) {
        updateRegistryPath(registry.localPath);
      }
    }

    const result = await centralizedPublishService.addComment(family, variant, comment);
    
    await db.execute({ sql: "INSERT INTO sources (id, name, url, type, characteristics) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", args: ["active-registry", "Active Registry", "local://active", "git", "[]"] });
    await registryService.syncFromLocalPath("active-registry", currentRegistryPath);

    return {
      content: [{ type: "text", text: `Successfully added comment to ${family}/${variant} in ${currentRegistryPath}.` }]
    };
  }

  if (name === "add_registry") {
    const newRegistry = z.object({
      name: z.string(),
      url: z.string(),
      type: z.enum(["git", "url"]),
      isDefault: z.boolean().optional(),
      localPath: z.string().optional()
    }).parse(args);

    const config = ConfigService.getConfig();
    
    if (newRegistry.isDefault) {
      config.registries.forEach(r => r.isDefaultPublishTarget = false);
    }

    config.registries.push({
      name: newRegistry.name,
      url: newRegistry.url,
      type: newRegistry.type,
      characteristics: [],
      localPath: newRegistry.localPath,
      isDefaultPublishTarget: newRegistry.isDefault || false
    });

    ConfigService.saveConfig(config);
    return { content: [{ type: "text", text: `Registry ${newRegistry.name} added successfully.` }] };
  }

  if (name === "list_registries") {
    const config = ConfigService.getConfig();
    return { content: [{ type: "text", text: JSON.stringify(config.registries, null, 2) }] };
  }

  if (name === "switch_active_registry") {
    const { name } = z.object({ name: z.string() }).parse(args);
    const config = ConfigService.getConfig();
    const registry = config.registries.find(r => r.name === name);
    
    if (!registry) {
      return { content: [{ type: "text", text: `Error: Registry ${name} not found.` }] };
    }

    if (registry.type === 'git' && registry.localPath) {
      updateRegistryPath(registry.localPath);
      return { content: [{ type: "text", text: `Switched active registry to ${name} (${registry.localPath})` }] };
    } else {
      return { content: [{ type: "text", text: `Error: Registry ${name} is not a Git registry with a localPath.` }] };
    }
  }

  if (name === "registry_list_blocks") {
    const blocks = await registryService.listBlocks();
    return { content: [{ type: "text", text: JSON.stringify(blocks, null, 2) }] };
  }

  if (name === "registry_get_block_wiring") {
    const { blockName } = z.object({ blockName: z.string() }).parse(args);
    const wiring = await registryService.getBlockWiring(blockName);
    return { content: [{ type: "text", text: wiring }] };
  }

  if (name === "registry_remove") {
    const { family, variant } = z.object({ family: z.string(), variant: z.string() }).parse(args);
    const result = await publishService.remove(family, variant);
    
    await db.execute({ sql: "INSERT INTO sources (id, name, url, type, characteristics) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING", args: ["active-registry", "Active Registry", "local://active", "git", "[]"] });
    await registryService.syncFromLocalPath("active-registry", currentRegistryPath);

    return {
      content: [{ type: "text", text: `Successfully removed ${family}/${variant}. Commit: ${result.commitHash}` }]
    };
  }

  
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
    const data = graphCache.load();
    const sorted = [...data.nodes].sort((a: any, b: any) => {
      const valA = a[metric] || 0;
      const valB = b[metric] || 0;
      return valB - valA;
    }).slice(0, 10);
    return { content: [{ type: "text", text: JSON.stringify(sorted, null, 2) }] };
  }

  if (name === "kernel_intelligence_get_dependency_graph") {
    const { community_id } = z.object({ community_id: z.string() }).parse(args);
    const data = graphCache.load();
    const nodes = data.nodes.filter((n: any) => n.community === community_id);
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { content: [{ type: "text", text: JSON.stringify({ nodes, edges }, null, 2) }] };
  }

  if (name === "kernel_policy_get_mode") {
    const mode = trackStateManager.getMode();
    return { content: [{ type: "text", text: mode }] };
  }

  throw new Error("Tool not found");
});


const graphCache = new GraphCache();
const trackStateManager = new TrackStateManager();

const syncManager = new SyncManager(db, registryService, gitService);

async function main() {
  await initDb();
  syncManager.startDaemon();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => console.error(e instanceof Error ? e.message : String(e)));
