import * as fs from 'node:fs';
import * as path from 'node:path';
import { crawlProject, type CrawlProjectOptions, type CrawlProjectResult } from './orchestrator.js';

export interface WireframeCrawlMcpArgs {
  projectRoot: string;
  baseUrl?: string;
  outputDir?: string;
  recordVideo?: boolean;
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
