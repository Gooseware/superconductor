import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonHeartbeat, EngineState } from '../src/concurrency/daemon-heartbeat';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('DaemonHeartbeat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should log error by default on timeout', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const heartbeat = new DaemonHeartbeat(100);
        heartbeat.start();
        vi.advanceTimersByTime(300);
        expect(consoleSpy).toHaveBeenCalledWith('Daemon heartbeat timeout');
    });

    it('should not infinitely loop after timeout', () => {
        const onTimeout = vi.fn();
        const heartbeat = new DaemonHeartbeat(100, onTimeout);
        heartbeat.start();
        vi.advanceTimersByTime(300);
        expect(onTimeout).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(300);
        expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('should not leak memory if start is called multiple times', () => {
        const onTimeout = vi.fn();
        const heartbeat = new DaemonHeartbeat(100, onTimeout);
        
        heartbeat.start();
        heartbeat.start();
        heartbeat.start();
        
        vi.advanceTimersByTime(300);
        expect(onTimeout).toHaveBeenCalledTimes(1);
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
            const engineState: EngineState = {};
            
            vi.mocked(fs.readFileSync).mockReturnValue('mock context');

            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            
            expect(engineState.context).toBe('mock context');
            expect(onReinject).toHaveBeenCalled();
        });

        it('should not re-inject when track context is present', () => {
            const onReinject = vi.fn();
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject });
            const engineState: EngineState = { context: 'already present' };
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onReinject).not.toHaveBeenCalled();
        });
    });

    describe('Retry/Escalation Limit', () => {
        it('should stop re-injecting and gracefully escalate after max retries are reached', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            const engineState: EngineState = {};

            vi.mocked(fs.readFileSync).mockReturnValue('mock context');
            
            // Fail 3 times, should reinject 3 times
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined; // mock failure
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            
            expect(onReinject).toHaveBeenCalledTimes(3);
            expect(onEscalate).not.toHaveBeenCalled();
            
            // 4th time, should escalate and NOT reinject
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onReinject).toHaveBeenCalledTimes(3);
            expect(onEscalate).toHaveBeenCalledTimes(1);
            
            // 5th time, should abort early due to guard clause
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(fs.readFileSync).toHaveBeenCalledTimes(3);
        });

        it('should reset retry count upon successful context verification', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            const engineState: EngineState = {};

            vi.mocked(fs.readFileSync)
                .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })
                .mockImplementationOnce(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); })
                .mockReturnValue('mock context');
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 1
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 2
            expect(onReinject).toHaveBeenCalledTimes(0);
            
            // Success resets it
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // success!
            expect(onReinject).toHaveBeenCalledTimes(1);

            engineState.context = 'now present';
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fast paths out
            expect(onReinject).toHaveBeenCalledTimes(1);
            
            engineState.context = undefined;
            // We can now fail 3 more times before escalation
            vi.mocked(fs.readFileSync).mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });

            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 1
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 2
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 3
            
            expect(onReinject).toHaveBeenCalledTimes(1);
            expect(onEscalate).not.toHaveBeenCalled();
            
            // 4th fail after reset escalates
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // fail 4 -> escalate
            expect(onEscalate).toHaveBeenCalledTimes(1);
        });

        it('should not call onEscalate multiple times if retries are exceeded', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries: 1 });
            const engineState: EngineState = {};
            
            // Simulating successful read but lost context
            vi.mocked(fs.readFileSync).mockReturnValue('mock context');
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // retryCount: 1
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // escalates (retryCount: 2)
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // no-op
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // no-op
            
            expect(onEscalate).toHaveBeenCalledTimes(1);
        });

        it('should not reinject if context is empty string', () => {
            const onReinject = vi.fn();
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject });
            const engineState: EngineState = { context: '' };
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onReinject).not.toHaveBeenCalled();
        });
    });
});
