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
        chmodSync: vi.fn(),
        statSync: vi.fn()
    };
});

describe('YoloAuditLogger', () => {
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

    it('should create log file with mode 0o600 if it does not exist in init', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);
        
        logger.init();

        expect(fs.appendFileSync).toHaveBeenCalledWith(
            path.join('/test/workspace', 'superconductor', 'logs', 'yolo-audit.log'),
            '',
            { mode: 0o600 }
        );
        expect(fs.chmodSync).toHaveBeenCalledWith(
            path.join('/test/workspace', 'superconductor', 'logs', 'yolo-audit.log'),
            0o600
        );
    });

    it('should throw error if chmodSync fails in init', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.chmodSync).mockImplementationOnce(() => {
            throw new Error('Permission denied');
        });

        expect(() => logger.init()).toThrowError('Failed to enforce permissions on audit log: Permission denied');
    });

    it('should throw error if file permissions are too open in init', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.chmodSync).mockReturnValue(undefined); // ensure it doesn't throw
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o644 } as any);

        expect(() => logger.init()).toThrowError('Audit log file permissions too open. Expected 0o600, got 644');
    });

    it('should pass init successfully when permissions are correct', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({ mode: 0o600 } as any);
        
        expect(() => logger.init()).not.toThrow();
        expect(fs.chmodSync).toHaveBeenCalledWith(
            path.join('/test/workspace', 'superconductor', 'logs', 'yolo-audit.log'),
            0o600
        );
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
});
