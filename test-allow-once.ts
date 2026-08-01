import { TrackStateManager } from './packages/superconductor-core/src/permissions/track-state.js';
import { PolicyEngine } from './packages/superconductor-core/src/permissions/engine.js';
import { ToolCallInterceptor } from './packages/superconductor-core/src/permissions/interceptor.js';
import { InlineOverrideHandler } from './packages/superconductor-core/src/permissions/prompter.js';
import { YoloAuditLogger } from './packages/superconductor-core/src/permissions/audit.js';

const stateManager = new TrackStateManager(process.cwd());
const policyEngine = new PolicyEngine(stateManager);
const auditLogger = new YoloAuditLogger(process.cwd());
const overrideHandler = new InlineOverrideHandler(stateManager, auditLogger, policyEngine, process.cwd());

overrideHandler.setAskUserImpl(async () => 'allow_once');

const interceptor = new ToolCallInterceptor(stateManager, policyEngine, process.cwd(), overrideHandler);

async function runTests() {
    require('fs').writeFileSync('superconductor/tracks.md', '- [~] mytrack');
    await new Promise(r => setTimeout(r, 250)); // let watcher catch up
    
    const manifest = {
        meta: { track_id: 'mytrack', generated_at: '', inferred_by: 'auto' as const },
        capabilities: { usb_access: false, arbitrary_shell: false, network_unrestricted: false, fs_outside_root: false, persistent: false },
        allowlist: { shell_prefixes: [], domains: [], paths: [] }
    };
    
    // Call 1: user prompted, returns allow_once
    console.log("Call 1 (Blocked, triggers prompt which returns allow_once):");
    const t1 = await interceptor.intercept('run_shell_command', { command: 'ls' }, manifest);
    console.log(t1);

    // Call 2: should it be blocked? The ephemeral allow is in the engine, so it evaluates to true, THEN consumes it
    console.log("Call 2 (Should ideally be blocked since we used the 'once' allowance in call 1):");
    const t2 = await interceptor.intercept('run_shell_command', { command: 'ls' }, manifest);
    console.log(t2);
    
    // Call 3: should be blocked, triggers prompt
    // Wait, let's change mock to deny
    overrideHandler.setAskUserImpl(async () => 'deny');
    console.log("Call 3:");
    const t3 = await interceptor.intercept('run_shell_command', { command: 'ls' }, manifest);
    console.log(t3);
}

runTests().catch(console.error);
