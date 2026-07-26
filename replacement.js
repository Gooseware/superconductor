const fs = require('fs');

const testPath = 'packages/engine/tests/daemon-heartbeat.test.ts';
let code = fs.readFileSync(testPath, 'utf8');

code = code.replace(
    /it\('should stop re-injecting and gracefully escalate after max retries are reached', \(\) => \{[\s\S]*?\}\);/,
    `it('should stop re-injecting and gracefully escalate after max retries are reached', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            const engineState: EngineState = {};

            vi.mocked(fs.readFileSync).mockImplementation(() => {
                const error = new Error('ENOENT') as any;
                error.code = 'ENOENT';
                throw error;
            });
            
            // Fail 3 times, should NOT reinject
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined; // mock failure
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            
            expect(onReinject).toHaveBeenCalledTimes(0);
            expect(onEscalate).not.toHaveBeenCalled();
            
            // 4th time, should escalate
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onReinject).toHaveBeenCalledTimes(0);
            expect(onEscalate).toHaveBeenCalledTimes(1);
            
            // 5th time, should abort early due to guard clause
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(fs.readFileSync).toHaveBeenCalledTimes(4);
        });`
);

code = code.replace(
    /it\('should reset retry count upon successful context verification', \(\) => \{[\s\S]*?\}\);/,
    `it('should reset retry count upon successful context verification', () => {
            const onReinject = vi.fn();
            const onEscalate = vi.fn();
            const maxRetries = 3;
            
            const heartbeat = new DaemonHeartbeat(100, vi.fn(), { onReinject, onEscalate, maxRetries });
            const engineState: EngineState = {};

            vi.mocked(fs.readFileSync).mockImplementation(() => {
                const error = new Error('ENOENT') as any;
                error.code = 'ENOENT';
                throw error;
            });
            
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            engineState.context = undefined;
            expect(onReinject).toHaveBeenCalledTimes(0);
            
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
            
            expect(onReinject).toHaveBeenCalledTimes(0);
            expect(onEscalate).not.toHaveBeenCalled();
            
            // 4th fail after reset escalates
            heartbeat.verifyTrackContext(engineState, '/fake/dir');
            expect(onEscalate).toHaveBeenCalledTimes(1);
        });`
);

fs.writeFileSync(testPath, code);

const implPath = 'packages/engine/src/concurrency/daemon-heartbeat.ts';
let impl = fs.readFileSync(implPath, 'utf8');
impl = impl.replace(
    /onTimeout: \(\) => void = \(\) => \{ console\.error\('Daemon heartbeat timeout'\); \},/,
    "onTimeout: () => void = () => { throw new Error('Daemon heartbeat timeout'); },"
);
fs.writeFileSync(implPath, impl);

