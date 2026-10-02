import * as fs from 'node:fs';
import * as path from 'node:path';
import { crawlProject, type CrawlProjectOptions, type CrawlProjectResult } from './orchestrator.js';

export interface WireframeCrawlMcpArgs {
  projectRoot: string;
  baseUrl?: string;
  outputDir?: string;
  recordVideo?: boolean;
  profile?: string;
  scenarios?: string;
}

export const WIREFRAME_CRAWL_TOOL_DECLARATION = {
  name: 'wireframe_crawl_project',
  description:
    'Crawl project routes, capture multi-viewport screenshots, record continuous journey video, probe interactive affordances/modals safely, and generate interactive wireframe flow boards.',
  inputSchema: {
    type: 'object',
    properties: {
      projectRoot: {
        type: 'string',
        description: 'Absolute path to project root directory',
      },
      baseUrl: {
        type: 'string',
        description: 'Optional running dev server base URL (e.g. http://127.0.0.1:5173)',
      },
      outputDir: {
        type: 'string',
        description: 'Optional directory path where wireframe board and manifest will be emitted',
      },
      profile: {
        type: 'string',
        description: 'Optional stored auth profile name to hydrate browser context',
      },
      scenarios: {
        type: 'string',
        description: 'Optional scenario file path defining dynamic goal execution',
      },
      recordVideo: {
        type: 'boolean',
        description: 'Whether to record continuous journey video (default: true)',
      },
    },
    required: ['projectRoot'],
  },
};

export async function handleWireframeCrawlProject(args: WireframeCrawlMcpArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const root = path.resolve(args.projectRoot);
  if (!fs.existsSync(root)) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: projectRoot does not exist: ${root}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result: CrawlProjectResult = await crawlProject({
      projectRoot: root,
      baseUrl: args.baseUrl,
      outputDir: args.outputDir,
      recordVideo: args.recordVideo !== false,
      profile: args.profile,
      scenarios: args.scenarios,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              totalScreens: result.totalScreens,
              htmlPath: result.htmlPath,
              jsonPath: result.jsonPath,
              videoPath: result.videoPath,
              durationMs: result.durationMs,
              markersCount: result.markers.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error during wireframe crawl: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleAuthCreateProfile(args: {
  url: string;
  profileName: string;
  port?: number;
  projectRoot?: string;
}): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const { createAuthSession } = await import('./browserAdapter.js');
    const session = await createAuthSession({
      url: args.url,
      profileName: args.profileName,
      port: args.port,
      projectRoot: args.projectRoot,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              profileName: session.profileName,
              port: session.port,
              authUrl: session.authUrl,
              message: 'Remote Human Auth Bridge started. Connect to authUrl to authenticate.',
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error starting auth session: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleAuthListProfiles(args?: {
  projectRoot?: string;
}): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const { listAuthProfiles } = await import('./browserAdapter.js');
    const profiles = await listAuthProfiles(args?.projectRoot);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              count: profiles.length,
              profiles,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing auth profiles: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleBrowserScrapeData(args: {
  url: string;
  mode?: 'read' | 'scrape';
  schema?: any;
  selector?: string;
  projectRoot?: string;
}): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const { scrapePage } = await import('./browserAdapter.js');
    const result = await scrapePage({
      url: args.url,
      mode: args.mode,
      schema: args.schema,
      selector: args.selector,
      projectRoot: args.projectRoot,
    });

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error scraping data: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}

export async function handleBrowserDistillTheme(args: {
  url: string;
  name?: string;
  projectRoot?: string;
}): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  try {
    const { distillPageTheme } = await import('./browserAdapter.js');
    const result = await distillPageTheme({
      url: args.url,
      name: args.name,
      projectRoot: args.projectRoot,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error distilling theme: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
}
