import { ToolCallInterceptor } from './packages/superconductor-core/dist/permissions/interceptor.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';

const sm = new TrackStateManager('/tmp/workspace');
sm.detectCurrentState = () => 'YOLO';
const engine = new PolicyEngine(sm);
const interceptor = new ToolCallInterceptor(sm, engine, '/tmp/workspace');

async function test() {
    const res = await interceptor.intercept('run_command', { CommandLine: 'cd superconductor && cd logs && rm yolo-audi\\t.log' });
    console.log("Payload 1 allowed:", res.allowed, res.reason);
    
    const res2 = await interceptor.intercept('run_command', { CommandLine: 'rm yolo-audit.lo\\g' });
    console.log("Payload 2 allowed:", res2.allowed, res2.reason);
}

test();
