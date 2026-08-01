import { TrackStateManager } from './packages/superconductor-core/src/permissions/track-state';
import { PolicyEngine } from './packages/superconductor-core/src/permissions/engine';
import { ToolCallInterceptor } from './packages/superconductor-core/src/permissions/interceptor';

async function run() {
    const stateManager = new TrackStateManager(process.cwd());
    const policyEngine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, policyEngine, process.cwd());

    // Mock IDLE mode
    stateManager.detectCurrentState = () => 'IDLE';

    console.log("--- IDLE MODE SHELL TESTS ---");
    let res = await interceptor.intercept('run_command', { command: 'echo "hello" > s*ductor/tracks.md' });
    console.log("Bypass 'superconductor' via glob:", res);

    res = await interceptor.intercept('run_command', { command: 'cd packages/superconductor-core && npm test' });
    console.log("Legit command blocked by 'superconductor':", res);

    console.log("--- YOLO LOG SHELL BYPASS TESTS ---");
    res = await interceptor.intercept('run_command', { command: 'rm -f */*/*.log' });
    console.log("Bypass YOLO audit log protection via */*/*.log:", res);
    
    res = await interceptor.intercept('run_command', { command: 'rm -f superconductor/l*s/yolo-audit.log' });
    console.log("Bypass YOLO audit log protection via l*s:", res);
}

run().catch(console.error);
