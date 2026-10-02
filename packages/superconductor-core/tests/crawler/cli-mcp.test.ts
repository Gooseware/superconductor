import { describe, it, expect } from 'vitest';
import { WIREFRAME_CRAWL_TOOL_DECLARATION, handleWireframeCrawlProject } from '../../src/crawler/mcpTool.js';
import { parseCrawlArgs } from '../../src/cli/crawl.js';

describe('CLI & MCP Crawler Interface Tests', () => {
  describe('CLI Args Parsing', () => {
    it('parses default CLI flags', () => {
      const parsed = parseCrawlArgs([]);
      expect(parsed.recordVideo).toBe(true);
      expect(parsed.standalone).toBe(true);
      expect(parsed.isHelp).toBe(false);
    });

    it('parses custom flags --dir, --base-url, --output, --no-video', () => {
      const parsed = parseCrawlArgs([
        '--dir', '/my/project',
        '--base-url', 'http://localhost:3000',
        '--output', 'custom/wireframes',
        '--no-video',
      ]);

      expect(parsed.dir).toBe('/my/project');
      expect(parsed.baseUrl).toBe('http://localhost:3000');
      expect(parsed.output).toBe('custom/wireframes');
      expect(parsed.recordVideo).toBe(false);
    });

    it('detects help flags', () => {
      expect(parseCrawlArgs(['--help']).isHelp).toBe(true);
      expect(parseCrawlArgs(['-h']).isHelp).toBe(true);
    });

    it('dispatches crawl --help via SuperconductorCliDispatcher', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['crawl', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('superconductor crawl');
      expect(output).toContain('--no-video');
    });
  });

  describe('MCP Tool Declaration & Handler', () => {
    it('exports valid MCP tool declaration for wireframe_crawl_project', () => {
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.name).toBe('wireframe_crawl_project');
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.inputSchema.properties).toHaveProperty('projectRoot');
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.inputSchema.properties).toHaveProperty('baseUrl');
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.inputSchema.properties).toHaveProperty('outputDir');
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.inputSchema.properties).toHaveProperty('recordVideo');
      expect(WIREFRAME_CRAWL_TOOL_DECLARATION.inputSchema.required).toContain('projectRoot');
    });

    it('returns error result if projectRoot does not exist', async () => {
      const res = await handleWireframeCrawlProject({
        projectRoot: '/non/existent/path/for/superconductor/test',
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('does not exist');
    });

    it('honors client-provided projectRoot in wireframe_crawl_project handler', async () => {
      const customPath = '/non/existent/client/custom/root';
      const res = await handleWireframeCrawlProject({
        projectRoot: customPath,
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain(customPath);
    });
  });

  describe('UX-4 Diagnostic Error Formatting & Progressive Status', () => {
    it('formats Elm/Rust style diagnostic error box with Problem, Cause, and Remediation', async () => {
      const { diagnoseCrawlError, formatDiagnosticBox } = await import('../../src/cli/crawl.js');
      const err = new Error('Project root does not exist: /fake/missing/project');
      const diagnostic = diagnoseCrawlError(err, '/fake/missing/project');

      expect(diagnostic.problem).toContain('/fake/missing/project');
      expect(diagnostic.cause).toBeDefined();
      expect(diagnostic.remediation).toContain('Try running: npx superconductor crawl --dir');

      const box = formatDiagnosticBox(diagnostic);
      expect(box).toContain('┌─ Error: Wireframe Crawl Failed');
      expect(box).toContain('Problem:');
      expect(box).toContain('Cause:');
      expect(box).toContain('Remediation:');
      expect(box).toContain('└──────────────────────────────────────────────────────────────────────────┘');
    });

    it('handles SSRF security errors with clear diagnostic remediation', async () => {
      const { diagnoseCrawlError, formatDiagnosticBox } = await import('../../src/cli/crawl.js');
      const err = new Error('SSRF security violation: baseUrl http://evil.com is not a permitted loopback address');
      const diagnostic = diagnoseCrawlError(err);

      expect(diagnostic.problem).toContain('Security policy violation');
      expect(diagnostic.remediation).toContain('--base-url http://localhost:3000');
      const box = formatDiagnosticBox(diagnostic);
      expect(box).toContain('SSRF');
    });

    it('runCrawlCli formats errors cleanly to stderr and exits without uncaught stack trace', async () => {
      const { runCrawlCli } = await import('../../src/cli/crawl.js');
      let stdoutOutput = '';
      let stderrOutput = '';

      // Test with non-existent directory and exitOnError: false so test process does not terminate
      await runCrawlCli(['--dir', '/non/existent/test/dir/xyz'], {
        stdout: (msg) => {
          stdoutOutput += msg + '\n';
        },
        stderr: (msg) => {
          stderrOutput += msg + '\n';
        },
        exitOnError: false,
      });

      expect(stderrOutput).toContain('┌─ Error: Wireframe Crawl Failed');
      expect(stderrOutput).toContain('Problem:');
      expect(stderrOutput).toContain('Cause:');
      expect(stderrOutput).toContain('Remediation:');
      expect(stderrOutput).toContain('Try running: npx superconductor crawl --dir');
    });
  });

  describe('Enhanced Crawl CLI with Profile & Scenarios', () => {
    it('parses --profile and --scenarios CLI flags', () => {
      const parsed = parseCrawlArgs([
        '--profile', 'admin-session',
        '--scenarios', './scenarios/checkout.json',
      ]);
      expect((parsed as any).profile).toBe('admin-session');
      expect((parsed as any).scenarios).toBe('./scenarios/checkout.json');
    });

    it('displays --profile and --scenarios in crawl help text', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['crawl', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('--profile');
      expect(output).toContain('--scenarios');
    });
  });

  describe('Core Browser Adapter Bridge', () => {
    it('exports all browser adapter functions from crawler/browserAdapter.js and crawler/index.js', async () => {
      const adapter = await import('../../src/crawler/browserAdapter.js');
      expect(typeof adapter.createAuthSession).toBe('function');
      expect(typeof adapter.listAuthProfiles).toBe('function');
      expect(typeof adapter.deleteAuthProfile).toBe('function');
      expect(typeof adapter.scrapePage).toBe('function');
      expect(typeof adapter.distillPageTheme).toBe('function');
      expect(typeof adapter.runBrowserStudio).toBe('function');

      const crawlerIndex = await import('../../src/crawler/index.js');
      expect(typeof (crawlerIndex as any).createAuthSession).toBe('function');
      expect(typeof (crawlerIndex as any).runBrowserStudio).toBe('function');
    });

    it('listAuthProfiles and deleteAuthProfile interact with AuthManager', async () => {
      const { listAuthProfiles, deleteAuthProfile } = await import('../../src/crawler/browserAdapter.js');
      const profiles = await listAuthProfiles();
      expect(Array.isArray(profiles)).toBe(true);
      const deleted = await deleteAuthProfile('non-existent-profile-xyz');
      expect(deleted).toBe(false);
    });

    it('createAuthSession starts RemoteAuthBridge', async () => {
      const { createAuthSession } = await import('../../src/crawler/browserAdapter.js');
      const session = await createAuthSession({
        url: 'http://127.0.0.1:3000/login',
        profileName: 'test-profile',
        port: 0,
      });

      expect(session).toBeDefined();
      expect(session.port).toBeGreaterThan(0);
      expect(session.token).toBeDefined();
      expect(session.authUrl).toContain(`http://127.0.0.1:${session.port}`);
      await session.stop();
    });

    it('scrapePage delegates to DualScraper in read mode', async () => {
      const { scrapePage } = await import('../../src/crawler/browserAdapter.js');
      const result = await scrapePage({
        url: 'https://example.com',
        mode: 'read',
      });
      expect(result).toBeDefined();
      expect(typeof result.markdown).toBe('string');
    });

    it('distillPageTheme delegates to ThemeDistiller', async () => {
      const { distillPageTheme } = await import('../../src/crawler/browserAdapter.js');
      const theme = await distillPageTheme({
        url: 'https://example.com',
        name: 'test-theme',
      });
      expect(theme).toBeDefined();
      expect(theme.name).toBeDefined();
    });

    it('runBrowserStudio starts Studio server', async () => {
      const { runBrowserStudio } = await import('../../src/crawler/browserAdapter.js');
      const studio = await runBrowserStudio({ port: 4498 });
      expect(studio).toBeDefined();
      expect(studio.port).toBe(4498);
      expect(studio.url).toContain('4498');
      await studio.stop();
    });
  });

  describe('New Browser CLI Dispatcher Commands', () => {
    it('dispatches auth --help', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['auth', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('auth <login|list|delete>');
    });

    it('dispatches studio --help', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['studio', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('studio [--port <port>]');
    });

    it('dispatches scrape --help', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['scrape', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('scrape [--url <url>]');
    });

    it('dispatches distill-theme --help', async () => {
      const { SuperconductorCliDispatcher } = await import('../../src/cli/cli-dispatcher.js');
      let output = '';
      await SuperconductorCliDispatcher.dispatch(['distill-theme', '--help'], {
        stdout: (msg) => {
          output += msg + '\n';
        },
      });
      expect(output).toContain('distill-theme [--url <url>]');
    });
  });

  describe('MCP Tools Schema & Handlers', () => {
    it('defines new browser tools and enhanced wireframe_crawl_project in SUPERCONDUCTOR_MCP_TOOLS', async () => {
      const { SUPERCONDUCTOR_MCP_TOOLS } = await import('../../src/protocol/mcp-schema.js');
      const toolNames = SUPERCONDUCTOR_MCP_TOOLS.map((t) => t.name);

      expect(toolNames).toContain('auth_create_profile');
      expect(toolNames).toContain('auth_list_profiles');
      expect(toolNames).toContain('browser_scrape_data');
      expect(toolNames).toContain('browser_distill_theme');
      expect(toolNames).toContain('wireframe_crawl_project');

      const wireframeTool = SUPERCONDUCTOR_MCP_TOOLS.find((t) => t.name === 'wireframe_crawl_project');
      expect(wireframeTool?.inputSchema.properties).toHaveProperty('profile');
      expect(wireframeTool?.inputSchema.properties).toHaveProperty('scenarios');
    });

    it('executes handleAuthListProfiles tool handler', async () => {
      const { handleAuthListProfiles } = await import('../../src/crawler/mcpTool.js');
      const res = await handleAuthListProfiles();
      expect(res.isError).toBeFalsy();
      expect(res.content).toHaveLength(1);
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.profiles)).toBe(true);
    });

    it('executes handleBrowserScrapeData tool handler in read mode', async () => {
      const { handleBrowserScrapeData } = await import('../../src/crawler/mcpTool.js');
      const res = await handleBrowserScrapeData({
        url: 'https://example.com',
        mode: 'read',
      });
      expect(res.isError).toBeFalsy();
      expect(res.content[0].text).toBeDefined();
    });

    it('executes handleBrowserDistillTheme tool handler', async () => {
      const { handleBrowserDistillTheme } = await import('../../src/crawler/mcpTool.js');
      const res = await handleBrowserDistillTheme({
        url: 'https://example.com',
        name: 'test-distilled',
      });
      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.name).toBeDefined();
    });

    it('executes handleAuthCreateProfile tool handler', async () => {
      const { handleAuthCreateProfile } = await import('../../src/crawler/mcpTool.js');
      const res = await handleAuthCreateProfile({
        url: 'https://example.com/login',
        profileName: 'test-mcp-profile',
        port: 0,
      });
      expect(res.isError).toBeFalsy();
      const parsed = JSON.parse(res.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.authUrl).toBeDefined();
    });
  });
});
