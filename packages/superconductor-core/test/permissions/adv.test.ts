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
      expect(res.reason).toMatch(/logs directory.*prohibited/i);
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

  // REV-21: The ancestor check — resolved is a parent of logsDir (not just a child/inside it)
  it('should block delete_file on ancestor of logsDir in YOLO mode (REV-21)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    // logsDir = /tmp/adv-workspace/superconductor/logs
    // 'superconductor' resolves to /tmp/adv-workspace/superconductor — an ancestor
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'YOLO';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    const res1 = await interceptor.intercept('delete_file', { TargetFile: 'superconductor' });
    expect(res1.allowed).toBe(false);
    expect(res1.reason).toMatch(/logs directory/i);

    // Also verify superconductor/logs itself is still blocked (child-check still works)
    const res2 = await interceptor.intercept('delete_file', { TargetFile: 'superconductor/logs' });
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toMatch(/logs directory/i);
  });

  it('should block delete_file on workspace root (broad ancestor of logsDir) in YOLO mode (REV-21)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'YOLO';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    // The workspace root /tmp/adv-workspace is also an ancestor of logsDir
    const res = await interceptor.intercept('delete_file', { TargetFile: ws });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/logs directory/i);
  });

  // REV-20: backtick command substitution and brace expansion bypass
  it('REV-20: should block backtick command substitution bypass (e.g. cat superconductor/`echo logs`/test)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    // Backtick command substitution: cat superconductor/`echo logs`/test
    const res1 = await interceptor.intercept('run_command', { CommandLine: 'cat superconductor/`echo logs`/test' });
    expect(res1.allowed).toBe(false);
    expect(res1.reason).toMatch(/globbing/i);

    // Brace expansion: rm -rf {superconductor,/tmp}
    const res2 = await interceptor.intercept('run_command', { CommandLine: 'rm -rf {superconductor,/tmp}' });
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toMatch(/globbing/i);
  });

  // REV-22: chained cd bypass via shell operators
  it('REV-22: should block chained cd bypass (e.g. cd superconductor && cd logs && rm yolo-audit.log)', async () => {
    const { ToolCallInterceptor } = await import('../../src/permissions/interceptor.js');
    const ws = '/tmp/adv-workspace';
    const stateManager = new TrackStateManager(ws);
    stateManager.detectCurrentState = () => 'TRACKED';
    const engine = new PolicyEngine(stateManager);
    const interceptor = new ToolCallInterceptor(stateManager, engine, ws);

    // && chaining: cd superconductor && cd logs && rm yolo-audit.log
    const res1 = await interceptor.intercept('run_command', { CommandLine: 'cd superconductor && cd logs && rm yolo-audit.log' });
    expect(res1.allowed).toBe(false);
    // Caught by substring 'yolo-audit' or chaining check
    expect(res1.reason).toMatch(/chaining|logs directory/i);

    // Semicolon chaining: cd superconductor; rm yolo-audit.log
    const res2 = await interceptor.intercept('run_command', { CommandLine: 'cd superconductor; rm yolo-audit.log' });
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toMatch(/chaining|logs directory/i);

    // || chaining (no yolo-audit/logs substring): false || cat /etc/passwd
    const res3 = await interceptor.intercept('run_command', { CommandLine: 'false || cat /etc/passwd' });
    expect(res3.allowed).toBe(false);
    expect(res3.reason).toMatch(/chaining/i);
  });
});
