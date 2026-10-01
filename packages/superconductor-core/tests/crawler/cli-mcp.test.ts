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
});
