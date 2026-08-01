import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YoloAuditLogger } from '../../src/permissions/audit';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        fchmodSync: vi.fn((...args) => actual.fchmodSync(...args)),
        statSync: vi.fn((...args) => actual.statSync(...args))
    };
});

describe('YoloAuditLogger', () => {
    let tmpDir: string;
    let logger: YoloAuditLogger;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
        logger = new YoloAuditLogger(tmpDir);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T05:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        fs.rmSync(tmpDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('should initialize with correct permissions', () => {
        logger.init();
        const logFile = path.join(tmpDir, 'superconductor', 'logs', 'yolo-audit.log');
        expect(fs.existsSync(logFile)).toBe(true);
        const stats = fs.statSync(logFile);
        expect(stats.mode & 0o777).toBe(0o600);
    });

    it('should throw if permissions are insecure (simulating fs ignoring chmod)', () => {
        logger.init();
        const logFile = path.join(tmpDir, 'superconductor', 'logs', 'yolo-audit.log');
        
        // mock fchmodSync to silently do nothing
        vi.mocked(fs.fchmodSync).mockImplementationOnce(() => {});
        // mock statSync to return an insecure mode 0o644
        vi.mocked(fs.statSync).mockReturnValueOnce({ mode: 0o644 } as any);
        
        const logger2 = new YoloAuditLogger(tmpDir);
        expect(() => logger2.init()).toThrow(/FATAL: Audit log file .* has excessive permissions. Permissions must be strictly 0o600./);
    });

    it('should log YOLO tool calls to audit file with correct schema', () => {
        logger.logToolCall('run_command', { command: 'ls -la' }, 'session-123');
        
        const logFile = path.join(tmpDir, 'superconductor', 'logs', 'yolo-audit.log');
        const contents = fs.readFileSync(logFile, 'utf8').trim().split('\n');
        expect(contents.length).toBe(1);
        const loggedData = JSON.parse(contents[0]);
        
        expect(loggedData).toEqual({
            timestamp: '2026-08-01T05:00:00.000Z',
            mode: 'YOLO',
            tool: 'run_command',
            argsHash: expect.any(String),
            sessionId: 'session-123',
            bypass: true
        });
    });

    it('should crash if init cannot secure the file', () => {
        vi.mocked(fs.fchmodSync).mockImplementationOnce(() => {
            throw new Error('EPERM');
        });
        
        expect(() => logger.init()).toThrow(/Failed to secure audit log file: EPERM/);
    });

    it('multiple appends do not result in overwrites', () => {
        logger.logToolCall('run_command', { command: 'ls -la' }, 'session-123');
        logger.logOverride('YOLO', 'run_command', { command: 'rm -rf' });
        
        const logFile = path.join(tmpDir, 'superconductor', 'logs', 'yolo-audit.log');
        const contents = fs.readFileSync(logFile, 'utf8').trim().split('\n');
        expect(contents.length).toBe(2);
    });
});
