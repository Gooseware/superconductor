import { ToolCallInterceptor } from './packages/superconductor-core/dist/permissions/interceptor.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';

const sm = new TrackStateManager('/tmp/workspace');
// Force IDLE mode
sm.detectCurrentState = () => 'IDLE';

const engine = new PolicyEngine(sm);
const interceptor = new ToolCallInterceptor(sm, engine, '/tmp/workspace');

async function test() {
    const res = await interceptor.intercept('write_file', { TargetFile: '.superconductor/session-flags.json' });
    console.log("Allowed to overwrite session-flags.json:", res.allowed);
}

test();
