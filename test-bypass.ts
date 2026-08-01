import { ToolCallInterceptor } from './packages/superconductor-core/src/permissions/interceptor.js';
import { PolicyEngine } from './packages/superconductor-core/src/permissions/engine.js';
import { TrackStateManager } from './packages/superconductor-core/src/permissions/track-state.js';
import * as path from 'path';

const ws = path.join(process.cwd(), 'tmp-workspace');
const stateManager = new TrackStateManager(ws);
// Force IDLE state
stateManager.detectCurrentState = () => 'IDLE';

const policyEngine = new PolicyEngine(stateManager);
const interceptor = new ToolCallInterceptor(stateManager, policyEngine, ws);

async function run() {
    console.log(await interceptor.intercept('write_file', { path: 'superconductor/tracks.md' }));
    console.log(await interceptor.intercept('write_file', { path: '/tmp-workspace/superconductor/tracks.md' }));
    console.log(await interceptor.intercept('write_file', { path: 'tracks.md' }));
}
run();
