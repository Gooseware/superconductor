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

    describe('Recovery Daemon Logic', () => {
        it('should detect missing track context and re-inject plan.md', () => {
            const onReinject = vi.fn();
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject });
            
            
            heartbeat.verifyTrackContext(false);
            expect(onReinject).toHaveBeenCalled();
        });

        it('should not re-inject when track context is present', () => {
            const onReinject = vi.fn();
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject });
            
            
            heartbeat.verifyTrackContext(true);
            expect(onReinject).not.toHaveBeenCalled();
        });
    });

    describe('Retry/Escalation Limit', () => {
        it('should stop re-injecting and gracefully escalate after max retries are reached', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            
            // Fail 3 times, should reinject 3 times
            
            heartbeat.verifyTrackContext(false);
            
            heartbeat.verifyTrackContext(false);
            
            heartbeat.verifyTrackContext(false);
            
            expect(onReinject).toHaveBeenCalledTimes(3);
            expect(onEscalate).not.toHaveBeenCalled();
            
            // 4th time, should escalate and NOT re-inject again
            
            heartbeat.verifyTrackContext(false);
            expect(onReinject).toHaveBeenCalledTimes(3);
            expect(onEscalate).toHaveBeenCalledTimes(1);
        });

        it('should reset retry count upon successful context verification', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            
            
            heartbeat.verifyTrackContext(false);
            
            heartbeat.verifyTrackContext(false);
            expect(onReinject).toHaveBeenCalledTimes(2);
            
            // Success resets it
            
            heartbeat.verifyTrackContext(true);
            
            // We can now fail 3 more times before escalation
            
            heartbeat.verifyTrackContext(false);
            
            heartbeat.verifyTrackContext(false);
            
            heartbeat.verifyTrackContext(false);
            
            expect(onReinject).toHaveBeenCalledTimes(5);
            expect(onEscalate).not.toHaveBeenCalled();
        });
    });
});
