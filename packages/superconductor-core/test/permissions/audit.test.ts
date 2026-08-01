import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YoloAuditLogger } from '../../src/permissions/audit';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs') as any;
    return {
        ...actual,
        appendFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        existsSync: vi.fn(),
        statSync: vi.fn(),
        chmodSync: vi.fn(),
        openSync: vi.fn(),
        closeSync: vi.fn(),
        writeFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        chmodSync: vi.fn(),
        statSync: vi.fn()
    };
});

describe('YoloAuditLogger', () => {
    it('should initialize with correct permissions', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o100600 } as any);
        logger.init();
        expect(fs.writeFileSync).toHaveBeenCalled();
        expect(fs.chmodSync).toHaveBeenCalledWith(expect.any(String), 0o600);
    });

    it('should throw if permissions are insecure', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o100644 } as any);
        expect(() => logger.init()).toThrow(/FATAL: Audit log file .* is writable by group\/other. Permissions must be strictly 0o600./);
    });

    let logger: YoloAuditLogger;

    beforeEach(() => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        logger = new YoloAuditLogger('/test/workspace');
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T05:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('init() should throw if file is writable by others', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o666 } as any);
        expect(() => logger.init()).toThrow(/FATAL: Audit log file .* is writable by group\/other. Permissions must be strictly 0o600./);
    });

    it('init() should set 0o600 and not throw if correct', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);
        expect(() => logger.init()).not.toThrow();
        expect(fs.chmodSync).toHaveBeenCalledWith(expect.any(String), 0o600);
    });

    it('should log YOLO tool calls to audit file with correct schema', () => {
        logger.logToolCall('run_command', { command: 'ls -la' }, 'session-123');
        
        expect(fs.appendFileSync).toHaveBeenCalled();
        const callArgs = vi.mocked(fs.appendFileSync).mock.calls[0];
        expect(callArgs[0]).toBe(path.join('/test/workspace', 'superconductor', 'logs', 'yolo-audit.log'));
        
        const loggedData = JSON.parse(callArgs[1] as string);
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
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.chmodSync).mockImplementation(() => { throw new Error('EPERM'); });
        
        expect(() => logger.init()).toThrow(/Failed to secure audit log file: EPERM/);
    });

    it('should crash if file is writable by group/other', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.chmodSync).mockReturnValue(undefined);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o644 } as fs.Stats);
        
        expect(() => logger.init()).toThrow(/FATAL: Audit log file .* is writable by group\/other\. Permissions must be strictly 0o600\./);
    });

    it('multiple appends do not result in overwrites', () => {
        logger.logToolCall('run_command', { command: 'ls -la' }, 'session-123');
        logger.logOverride('YOLO', 'run_command', { command: 'rm -rf' });
        
        expect(fs.appendFileSync).toHaveBeenCalledTimes(2);
    });
});
