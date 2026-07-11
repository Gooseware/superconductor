import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonHeartbeat } from '../src/concurrency/daemon-heartbeat';

describe('DaemonHeartbeat', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should trigger timeout when heartbeat is missed', () => {
        const onTimeout = vi.fn();
        const heartbeat = new DaemonHeartbeat(100, onTimeout);
        
        heartbeat.start();
        expect(onTimeout).not.toHaveBeenCalled();
        
        vi.advanceTimersByTime(300);
        expect(onTimeout).toHaveBeenCalled();
        
        heartbeat.stop();
    });

    it('should not trigger timeout when heartbeat is pinged', () => {
        const onTimeout = vi.fn();
        const heartbeat = new DaemonHeartbeat(100, onTimeout);
        
        heartbeat.start();
        
        vi.advanceTimersByTime(150);
        heartbeat.ping();
        
        vi.advanceTimersByTime(150);
        expect(onTimeout).not.toHaveBeenCalled();
        
        heartbeat.stop();
    });
});
