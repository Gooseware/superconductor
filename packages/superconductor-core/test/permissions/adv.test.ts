import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../src/permissions/engine.js';
import { TrackStateManager } from '../../src/permissions/track-state.js';

describe('Adversarial Tests', () => {
  it('should block backtick command injection', () => {
    const stateManager = new TrackStateManager('/workspace');
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    
    engine.setActiveManifest({
      capabilities: {
        arbitrary_shell: false,
        usb_access: false,
        network_unrestricted: false,
        fs_outside_root: false
      }
    } as any);
    
    const allowed = engine.isToolCallPermitted('run_command', { CommandLine: 'echo `whoami`' });
    expect(allowed).toBe(false); // We want it to be blocked
  });

  it('should block path traversal bypass', () => {
    const stateManager = new TrackStateManager('/workspace');
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    
    engine.setActiveManifest({ capabilities: { fs_outside_root: false } } as any);
    
    const allowed = engine.isToolCallPermitted('write_file', { TargetFile: '/workspace-hacked/secret.txt' });
    console.log("Allowed:", allowed, "Active Manifest:", engine.getActiveManifest());
    expect(allowed).toBe(false); // Should be blocked because it's not inside /workspace
  });

  it('should block bash globbing and variables in run_command (REV-17)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);
    
    const res1 = await interceptor.intercept('run_command', { CommandLine: 'cat log?/yolo-aud*' });
    expect(res1.allowed).toBe(false);
    expect(res1.reason).toMatch(/globbing/i);
    
    const res2 = await interceptor.intercept('run_command', { CommandLine: 'echo $PATH' });
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toMatch(/globbing/i);
  });

  it('should block deletion of parent directories in IDLE mode (REV-18)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'IDLE';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);
    
    const res1 = await interceptor.intercept('delete_file', { TargetFile: 'superconductor' });
    expect(res1.allowed).toBe(false);
    expect(res1.reason).toMatch(/IDLE mode spoofing/i);
    
    const res2 = await interceptor.intercept('delete_file', { TargetFile: 'superconductor/tracks' });
    expect(res2.allowed).toBe(false);

    stateManager.detectCurrentState = () => 'YOLO';
    const res3 = await interceptor.intercept('delete_file', { TargetFile: 'superconductor/logs' });
    expect(res3.allowed).toBe(false);
    expect(res3.reason).toMatch(/logs directory/i);
  });
});
