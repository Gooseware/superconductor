import { ToolCallInterceptor } from './packages/superconductor-core/dist/permissions/interceptor.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';

const sm = new TrackStateManager('/tmp/workspace');
// Force YOLO mode
sm.detectCurrentState = () => 'YOLO';
const engine = new PolicyEngine(sm);
const interceptor = new ToolCallInterceptor(sm, engine, '/tmp/workspace');

async function test() {
    const res = await interceptor.intercept('run_command', { CommandLine: 'cd superconductor/logs && rm *' });
    console.log("Allowed to delete logs with glob:", res.allowed);
    const res2 = await interceptor.intercept('run_command', { CommandLine: 'rm superconductor/logs/yolo-audit.lo\\g' });
    console.log("Allowed to delete log with backslash escape:", res2.allowed);
}

test();
