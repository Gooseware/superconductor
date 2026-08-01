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
});
