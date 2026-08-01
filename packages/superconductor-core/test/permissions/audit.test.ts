import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { YoloAuditLogger } from '../../src/permissions/audit';

// Actual log path written by YoloAuditLogger constructor
const LOG_SUBPATH = path.join('superconductor', 'logs', 'yolo-audit.log');

describe('YoloAuditLogger', () => {
  let tmpDir: string;
  let workspacePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
    workspacePath = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspacePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.skipIf(process.platform !== 'linux')('init() sets 0o600 permissions', () => {
    const logger = new YoloAuditLogger(workspacePath);
    logger.init();

    const logFile = path.join(workspacePath, LOG_SUBPATH);
    const stat = fs.statSync(logFile);
    expect(stat.mode & 0o777).toBe(0o600);

    logger.close();
  });

  it.skipIf(process.platform !== 'linux')('init() throws on symlink target', () => {
    // Pre-create the logDir so the constructor succeeds
    const logDir = path.join(workspacePath, 'superconductor', 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, 'yolo-audit.log');
    const victim = path.join(tmpDir, 'victim.txt');
    fs.writeFileSync(victim, 'secret');
    fs.symlinkSync(victim, logFile); // place symlink where the log file would be created

    const logger = new YoloAuditLogger(workspacePath);
    expect(() => logger.init()).toThrow(); // O_NOFOLLOW rejects symlink

    // Victim file must be untouched
    expect(fs.readFileSync(victim, 'utf8')).toBe('secret');
  });

  it('init() is idempotent — calling twice does not throw or duplicate fd', () => {
    const logger = new YoloAuditLogger(workspacePath);
    logger.init();
    // Second call must be a no-op (guard: if (this.initialized) return)
    expect(() => logger.init()).not.toThrow();
    // Should still work after double init
    logger.logToolCall('idempotent-test', {}, 'sess-1');
    logger.close();

    const logFile = path.join(workspacePath, LOG_SUBPATH);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBe(1);
  });

  it('multiple appends produce ordered log entries', () => {
    const logger = new YoloAuditLogger(workspacePath);
    logger.logToolCall('tool1', { a: 1 }, 'sess-1');
    logger.logToolCall('tool2', { b: 2 }, 'sess-1');
    logger.logToolCall('tool3', { c: 3 }, 'sess-1');
    logger.close();

    const logFile = path.join(workspacePath, LOG_SUBPATH);
    const content = fs.readFileSync(logFile, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);

    expect(lines.length).toBe(3);
    const entries = lines.map(l => JSON.parse(l));
    expect(entries[0].tool).toBe('tool1');
    expect(entries[1].tool).toBe('tool2');
    expect(entries[2].tool).toBe('tool3');
  });

  it('logToolCall before init() auto-initializes', () => {
    const logger = new YoloAuditLogger(workspacePath);
    logger.logToolCall('auto-init-test', {}, 'sess-1');
    logger.close();

    const logFile = path.join(workspacePath, LOG_SUBPATH);
    const content = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.tool).toBe('auto-init-test');
  });

  it('logOverride writes INLINE_OVERRIDE entry', () => {
    const logger = new YoloAuditLogger(workspacePath);
    logger.logOverride('APPROVE', 'write_file', { path: '/tmp/x' });
    logger.close();

    const logFile = path.join(workspacePath, LOG_SUBPATH);
    const content = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(content);
    expect(entry.event).toBe('INLINE_OVERRIDE');
    expect(entry.choice).toBe('APPROVE');
    expect(entry.tool).toBe('write_file');
  });
});
