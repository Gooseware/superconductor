import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { DevServerManager } from '../../src/crawler/serverManager.js';

describe('DevServerManager', () => {
  const openServers: Array<http.Server | net.Server> = [];
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    while (openServers.length > 0) {
      const s = openServers.pop();
      await new Promise<void>((resolve) => {
        s?.close(() => resolve());
      });
    }
    for (const dir of cleanupDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  });

  describe('probePort', () => {
    it('returns true when a port is actively listening', async () => {
      const server = http.createServer((_req, res) => res.end('ok'));
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      });
      openServers.push(server);

      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      expect(port).toBeGreaterThan(0);

      const manager = new DevServerManager();
      const isOpen = await manager.probePort(port);
      expect(isOpen).toBe(true);

      // Also verify static call
      const isOpenStatic = await DevServerManager.probePort(port);
      expect(isOpenStatic).toBe(true);
    });

    it('returns false when a port is not listening', async () => {
      // Find an unused port by creating a server, getting port, and closing it
      const server = net.createServer();
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await new Promise<void>((resolve) => server.close(() => resolve()));

      const manager = new DevServerManager();
      const isOpen = await manager.probePort(port, '127.0.0.1', 500);
      expect(isOpen).toBe(false);
    });
  });

  describe('detectActiveServer', () => {
    it('returns http://127.0.0.1:<port> when an active server matches candidate ports', async () => {
      const server = http.createServer((_req, res) => res.end('ok'));
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      });
      openServers.push(server);

      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const candidates = [59990, port, 59991];
      const manager = new DevServerManager();
      const detectedUrl = await manager.detectActiveServer(candidates);
      expect(detectedUrl).toBe(`http://127.0.0.1:${port}`);
    });

    it('returns null if none of the candidate ports are active', async () => {
      const candidates = [59981, 59982];
      const manager = new DevServerManager();
      const detectedUrl = await manager.detectActiveServer(candidates);
      expect(detectedUrl).toBeNull();
    });
  });

  describe('spawnDevServer', () => {
    it('spawns a lightweight simulated dev server, extracts URL and stops cleanly', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-dev-server-test-'));
      cleanupDirs.push(tmpDir);

      // Create a test server script that listens on a dynamic port and outputs server URL
      const scriptPath = path.join(tmpDir, 'server.js');
      fs.writeFileSync(
        scriptPath,
        `
const http = require('node:http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('alive');
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log('  ➜  Local:   http://localhost:' + port + '/');
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
`
      );

      const manager = new DevServerManager();
      const { url, stop } = await manager.spawnDevServer({
        projectRoot: tmpDir,
        command: 'node',
        args: ['server.js'],
        timeoutMs: 10000,
      });

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const portMatch = url.match(/:(\d+)$/);
      expect(portMatch).not.toBeNull();
      const port = parseInt(portMatch![1], 10);

      // Server should be probing open
      const isListening = await manager.probePort(port);
      expect(isListening).toBe(true);

      // Stop dev server
      await stop();

      // Give process a moment to release socket
      let isStillListening = true;
      for (let i = 0; i < 20; i++) {
        isStillListening = await manager.probePort(port, '127.0.0.1', 100);
        if (!isStillListening) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(isStillListening).toBe(false);
    });

    it('rejects if server process fails to emit a valid listening port within timeout', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-dev-server-timeout-'));
      cleanupDirs.push(tmpDir);

      const scriptPath = path.join(tmpDir, 'silent.js');
      fs.writeFileSync(
        scriptPath,
        `
// Does not output any matching URL
console.log('Starting something without URL...');
setInterval(() => {}, 1000);
`
      );

      const manager = new DevServerManager();
      await expect(
        manager.spawnDevServer({
          projectRoot: tmpDir,
          command: 'node',
          args: ['silent.js'],
          timeoutMs: 1000,
        })
      ).rejects.toThrow(/timeout/i);
    });

    it('rejects if server process exits prematurely before emitting a URL', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-dev-server-exit-'));
      cleanupDirs.push(tmpDir);

      const scriptPath = path.join(tmpDir, 'crash.js');
      fs.writeFileSync(
        scriptPath,
        `
console.error('Fatal crash on startup');
process.exit(1);
`
      );

      const manager = new DevServerManager();
      await expect(
        manager.spawnDevServer({
          projectRoot: tmpDir,
          command: 'node',
          args: ['crash.js'],
          timeoutMs: 5000,
        })
      ).rejects.toThrow(/exited prematurely/i);
    });
  });
});
