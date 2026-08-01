import { ToolCallInterceptor } from './packages/superconductor-core/dist/permissions/interceptor.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';

const sm = new TrackStateManager('/tmp/workspace');
sm.detectCurrentState = () => 'YOLO';
const engine = new PolicyEngine(sm);
const interceptor = new ToolCallInterceptor(sm, engine, '/tmp/workspace');

async function test() {
    const res3 = await interceptor.intercept('run_command', { CommandLine: 'cd superconductor ; cd logs ; rm -rf *' });
    console.log("Payload 3 allowed:", res3.allowed);
}

test();
