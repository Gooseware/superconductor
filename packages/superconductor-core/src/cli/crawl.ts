import * as path from 'node:path';
import { crawlProject, type CrawlProjectResult } from '../crawler/orchestrator.js';

export interface ParsedCrawlArgs {
  dir?: string;
  baseUrl?: string;
  output?: string;
  routesFile?: string;
  recordVideo: boolean;
  standalone: boolean;
  isHelp: boolean;
  json: boolean;
  profile?: string;
  scenarios?: string;
}

export function parseCrawlArgs(args: string[] = []): ParsedCrawlArgs {
  const result: ParsedCrawlArgs = {
    recordVideo: true,
    standalone: true,
    isHelp: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.isHelp = true;
      continue;
    }

    if (arg === '--json') {
      result.json = true;
      continue;
    }

    if (arg === '--no-video') {
      result.recordVideo = false;
      continue;
    }

    if (arg === '--standalone') {
      result.standalone = true;
      continue;
    }

    if (arg === '--dir' || arg === '-d') {
      result.dir = args[++i];
      continue;
    }
    if (arg.startsWith('--dir=')) {
      result.dir = arg.slice('--dir='.length);
      continue;
    }

    if (arg === '--base-url' || arg === '-u') {
      result.baseUrl = args[++i];
      continue;
    }
    if (arg.startsWith('--base-url=')) {
      result.baseUrl = arg.slice('--base-url='.length);
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
      continue;
    }
    if (arg.startsWith('--output=')) {
      result.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--routes-file') {
      result.routesFile = args[++i];
      continue;
    }
    if (arg.startsWith('--routes-file=')) {
      result.routesFile = arg.slice('--routes-file='.length);
      continue;
    }

    if (arg === '--profile') {
      result.profile = args[++i];
      continue;
    }
    if (arg.startsWith('--profile=')) {
      result.profile = arg.slice('--profile='.length);
      continue;
    }

    if (arg === '--scenarios') {
      result.scenarios = args[++i];
      continue;
    }
    if (arg.startsWith('--scenarios=')) {
      result.scenarios = arg.slice('--scenarios='.length);
      continue;
    }
  }

  return result;
}

export function getCrawlHelpText(): string {
  return `
Usage: superconductor crawl [options]

Automated App Wireframe & Route Flow Crawler.
Extracts routes, probes dev servers, captures multi-viewport screenshots,
records continuous journey video, probes safe interactives/modals, and emits
interactive wireframe boards.

Options:
  --dir, -d <path>         Target project root directory (default: current directory)
  --base-url, -u <url>     Explicit running dev server base URL (e.g. http://localhost:3000)
  --output, -o <dir>       Output directory for board, manifest & recordings (default: superconductor/wireframes)
  --routes-file <file>     Explicit routes definition file
  --profile <name>         Hydrate browser context with stored authentication profile
  --scenarios <file>       Execute dynamic goal scenarios alongside static route crawl
  --no-video               Disable continuous journey video recording
  --standalone             Emit standalone HTML board artifact (default: true)
  --json                   Output machine-readable JSON result to stdout
  -h, --help               Display this help text
`.trim();
}

export interface DiagnosticErrorDetails {
  problem: string;
  cause: string;
  remediation: string;
}

export function formatDiagnosticBox(details: DiagnosticErrorDetails): string {
  const width = 76;
  const topBorder = `┌─ Error: Wireframe Crawl Failed ${'─'.repeat(Math.max(0, width - 34))}┐`;
  const bottomBorder = `└${'─'.repeat(width - 2)}┘`;
  const emptyLine = `│${' '.repeat(width - 2)}│`;

  const formatSection = (title: string, body: string): string[] => {
    const lines: string[] = [];
    lines.push(`│   ${title}:`.padEnd(width - 1) + '│');
    const textLines = body.split('\n');
    for (const rawLine of textLines) {
      const maxWidth = width - 8;
      if (rawLine.length <= maxWidth) {
        lines.push(`│     ${rawLine}`.padEnd(width - 1) + '│');
      } else {
        let remaining = rawLine;
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, maxWidth);
          remaining = remaining.slice(maxWidth);
          lines.push(`│     ${chunk}`.padEnd(width - 1) + '│');
        }
      }
    }
    return lines;
  };

  return [
    '',
    topBorder,
    emptyLine,
    ...formatSection('Problem', details.problem),
    emptyLine,
    ...formatSection('Cause', details.cause),
    emptyLine,
    ...formatSection('Remediation', details.remediation),
    emptyLine,
    bottomBorder,
    '',
  ].join('\n');
}

export function diagnoseCrawlError(err: unknown, projectRoot?: string): DiagnosticErrorDetails {
  const msg = err instanceof Error ? err.message : String(err);
  const targetDir = projectRoot || 'the target directory';

  if (msg.includes('Project root does not exist') || (err as any)?.code === 'ENOENT') {
    return {
      problem: `Project root directory does not exist: ${targetDir}`,
      cause: `The target directory specified was not found on the filesystem or could not be accessed.`,
      remediation: `Try running: npx superconductor crawl --dir <path>\nVerify that the target path exists and points to your project root.`,
    };
  }

  if (msg.includes('SSRF') || msg.includes('loopback') || msg.includes('cloud metadata')) {
    return {
      problem: `Security policy violation: ${msg}`,
      cause: `Crawler enforces strict loopback confinement (127.0.0.1, localhost, ::1) to protect against SSRF.`,
      remediation: `Try running: npx superconductor crawl --base-url http://localhost:3000\nEnsure baseUrl points strictly to a local loopback server.`,
    };
  }

  if (msg.includes('baseUrl') || msg.includes('Invalid baseUrl')) {
    return {
      problem: `Invalid base URL configuration: ${msg}`,
      cause: `The provided base URL is malformed or uses an unsupported protocol.`,
      remediation: `Try running: npx superconductor crawl --base-url http://localhost:3000\nEnsure the base URL includes http:// or https://.`,
    };
  }

  if (msg.includes('dev server') || msg.includes('ECONNREFUSED') || msg.includes('Failed to spawn dev server')) {
    return {
      problem: `Unable to connect to or launch development server.`,
      cause: msg,
      remediation: `Start your development server manually (e.g. npm run dev), then pass the URL:\nTry running: npx superconductor crawl --base-url http://localhost:3000`,
    };
  }

  if (msg.includes('browser') || msg.includes('playwright') || msg.includes('Chromium') || msg.includes('executablePath')) {
    return {
      problem: `Headless browser engine failed to launch.`,
      cause: msg,
      remediation: `Ensure Playwright browser binaries are installed or specify chromium path:\nTry running: npx playwright install chromium\nOr: npx superconductor crawl --dir <path>`,
    };
  }

  return {
    problem: `Error encountered during wireframe crawl: ${msg}`,
    cause: `An unhandled exception occurred during the route extraction or crawling pipeline.`,
    remediation: `Try running: npx superconductor crawl --dir <path>\nCheck the logs above for specific component or route errors.`,
  };
}

export interface RunCrawlCliOptions {
  cwd?: string;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  exitOnError?: boolean;
}

export async function runCrawlCli(
  args: string[] = [],
  options?: RunCrawlCliOptions
): Promise<CrawlProjectResult | void> {
  const stdout = options?.stdout ?? console.log;
  const stderr = options?.stderr ?? console.error;
  const cwd = options?.cwd ?? process.cwd();

  const parsed = parseCrawlArgs(args);

  if (parsed.isHelp) {
    stdout(getCrawlHelpText());
    return;
  }

  const projectRoot = parsed.dir ? path.resolve(cwd, parsed.dir) : cwd;

  try {
    stdout(`[superconductor:crawl] Starting crawl on project: ${projectRoot}`);
    if (parsed.baseUrl) {
      stdout(`[superconductor:crawl] Using target base URL: ${parsed.baseUrl}`);
    }

    const onProgress = (msg: string) => {
      if (!parsed.json) {
        stdout(`[superconductor:crawl] ${msg}`);
      }
    };

    const result = await crawlProject({
      projectRoot,
      baseUrl: parsed.baseUrl,
      outputDir: parsed.output,
      routesFile: parsed.routesFile,
      recordVideo: parsed.recordVideo,
      standalone: parsed.standalone,
      profile: parsed.profile,
      scenarios: parsed.scenarios,
      onProgress,
    });

    if (parsed.json) {
      stdout(JSON.stringify(result, null, 2));
    } else {
      stdout(`[superconductor:crawl] Crawl completed successfully in ${result.durationMs}ms`);
      stdout(`[superconductor:crawl] Total Screens: ${result.totalScreens}`);
      stdout(`[superconductor:crawl] Board HTML: ${result.htmlPath}`);
      stdout(`[superconductor:crawl] Flow Graph: ${result.jsonPath}`);
      if (result.videoPath) {
        stdout(`[superconductor:crawl] Journey Video: ${result.videoPath}`);
      }
    }

    return result;
  } catch (err: any) {
    const diagnostic = diagnoseCrawlError(err, projectRoot);
    const box = formatDiagnosticBox(diagnostic);
    stderr(box);

    process.exitCode = 1;
    if (options?.exitOnError || (options?.exitOnError !== false && process.env.NODE_ENV !== 'test')) {
      process.exit(1);
    }
    return;
  }
}
