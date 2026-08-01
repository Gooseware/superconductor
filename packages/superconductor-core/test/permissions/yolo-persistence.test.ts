import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackStateManager } from '../../src/permissions/track-state';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs') as any;
    return {
        ...actual,
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        existsSync: vi.fn(),
        renameSync: vi.fn(),
        mkdirSync: vi.fn()
    };
});

describe('YOLO Persistence', () => {
    let stateManager: TrackStateManager;
    
    beforeEach(() => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        stateManager = new TrackStateManager('/test/workspace');
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T05:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('should not persist yolo state if persist is false', () => {
        stateManager.setYolo(true, 'session-123', false);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(stateManager.detectCurrentState()).toBe('YOLO');
    });

    it('should persist yolo state atomically if persist is true', () => {
        stateManager.setYolo(true, 'session-123', true);
        
        const tempPath = path.join('/test/workspace', '.superconductor', 'session-flags.json.tmp');
        const finalPath = path.join('/test/workspace', '.superconductor', 'session-flags.json');
        
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            tempPath,
            expect.stringContaining('"yolo": true')
        );
        expect(fs.renameSync).toHaveBeenCalledWith(tempPath, finalPath);
    });
});
