import { TrackStateManager } from './packages/superconductor-core/src/permissions/track-state';
import { PolicyEngine } from './packages/superconductor-core/src/permissions/engine';
import { ToolCallInterceptor } from './packages/superconductor-core/src/permissions/interceptor';

async function run() {
    const stateManager = new TrackStateManager(process.cwd());
    const policyEngine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, policyEngine, process.cwd());

    stateManager.detectCurrentState = () => 'IDLE';
    let res = await interceptor.intercept('run_command', { command: 'echo "hello" > s*ductor/t""racks.md' });
    console.log("String concatenation bypass IDLE mode:", res);
    
    // Test base64 bypass
    res = await interceptor.intercept('run_command', { command: 'echo "cm0gLXJmIHkxbG8tYXVkaXQubG9n" | base64 -d | sh' });
    console.log("Base64 bypass:", res);
    
    // Test env var bypass
    res = await interceptor.intercept('run_command', { command: 'F=yolo-audit.log; rm -rf $F' });
    console.log("Env var bypass:", res);
}
run().catch(console.error);
