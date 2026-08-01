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
        existsSync: vi.fn()
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
