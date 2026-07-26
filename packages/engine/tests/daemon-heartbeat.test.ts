import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DaemonHeartbeat, EngineState } from '../src/concurrency/daemon-heartbeat';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('DaemonHeartbeat', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should throw Error by default on timeout', () => {
        const heartbeat = new DaemonHeartbeat(100);
        heartbeat.start();
        expect(() => {
            vi.advanceTimersByTime(300);
        }).toThrow('Daemon heartbeat timeout');
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
            
            // 4th time, should escalate and NOT re-inject again
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onReinject).toHaveBeenCalledTimes(3);
            expect(onEscalate).toHaveBeenCalledTimes(1);
        });

        it('should reset retry count upon successful context verification', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            const engineState: EngineState = {};

            vi.mocked(fs.readFileSync).mockReturnValue('mock context');
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            expect(onReinject).toHaveBeenCalledTimes(2);
            
            // Success resets it
            engineState.context = 'now present';
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            
            // We can now fail 3 more times before escalation
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            
            expect(onReinject).toHaveBeenCalledTimes(5);
            expect(onEscalate).not.toHaveBeenCalled();
        });

        it('should not call onEscalate multiple times if retries are exceeded', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries: 1 });
            const engineState: EngineState = {};
            
            // Simulating ENOENT
            const error = new Error('ENOENT') as any;
            error.code = 'ENOENT';
            vi.mocked(fs.readFileSync).mockImplementation(() => { throw error; });
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // retryCount: 1
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // escalates (retryCount: 2)
            heartbeat.verifyTrackContext(engineState, '/fake/dir'); // no-op
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
