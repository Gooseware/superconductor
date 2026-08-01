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

  // REV-17: Test the REAL exploit vectors — not just globbing/variables
  it('should block backtick command substitution used as path prefix (REV-17)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    // Real exploit: backtick substitution embeds path that resolves to logs dir
    // Command: `echo superconductor/logs`/yolo-audit.log
    const res1 = await interceptor.intercept('run_command', {
      CommandLine: '`echo superconductor/logs`/yolo-audit.log'
    });
    expect(res1.allowed).toBe(false);
    // Should be caught by backtick regex before path resolution
    expect(res1.reason).toMatch(/globbing|chaining|shell|substitution/i);
  });

  it('should block chained cd that pivots into logs directory (REV-17)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    // Real exploit: chain cd commands to land in logs dir and delete the audit log
    const res = await interceptor.intercept('run_command', {
      CommandLine: 'cd superconductor && cd logs && rm yolo-audit.log'
    });
    expect(res.allowed).toBe(false);
    // Should be caught by chaining operator block
    expect(res.reason).toMatch(/chaining|shell|prohibited/i);
  });

  // REV-18: Test the REAL exploit vectors — parent directory deletion in ALL modes
  it('should block delete_file on superconductor parent directory in all modes (REV-18)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const engine = new PolicyEngine(new TrackStateManager(ws));

    for (const mode of ['IDLE', 'TRACKED', 'YOLO'] as const) {
      const stateManager = new TrackStateManager(ws);
      stateManager.detectCurrentState = () => mode;
      const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

      const res = await interceptor.intercept('delete_file', { TargetFile: 'superconductor' });
      expect(res.allowed, `delete_file on superconductor should be blocked in ${mode} mode`).toBe(false);
      // Global guard must fire before any state-specific logic
      expect(res.reason).toMatch(/superconductor|prohibited/i);
    }
  });

  it('should block delete_file on superconductor/logs directory in all modes (REV-18)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const engine = new PolicyEngine(new TrackStateManager(ws));

    for (const mode of ['IDLE', 'TRACKED', 'YOLO'] as const) {
      const stateManager = new TrackStateManager(ws);
      stateManager.detectCurrentState = () => mode;
      const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

      const res = await interceptor.intercept('delete_file', { TargetFile: 'superconductor/logs' });
      expect(res.allowed, `delete_file on superconductor/logs should be blocked in ${mode} mode`).toBe(false);
      expect(res.reason).toMatch(/logs directory|prohibited/i);
    }
  });
});
