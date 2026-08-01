import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEngine } from '../../src/permissions/engine';
import { TrackStateManager } from '../../src/permissions/track-state';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  let stateManager: TrackStateManager;

  beforeEach(() => {
    stateManager = {
      detectCurrentState: vi.fn(),
      getActiveTrackId: vi.fn(),
      workspacePath: process.cwd()
    } as unknown as TrackStateManager;

    engine = new PolicyEngine(stateManager);
  });

  describe('isToolCallPermitted', () => {
    it('No active track -> isToolCallPermitted() returns true for any tool', () => {
      vi.mocked(stateManager.detectCurrentState).mockReturnValue('IDLE');
      expect(engine.isToolCallPermitted('write_file', { path: 'any' })).toBe(true);
      expect(engine.isToolCallPermitted('run_shell_command', { command: 'any' })).toBe(true);
      expect(engine.isToolCallPermitted('mcp_call', { method: 'any' })).toBe(true);
    });

    it('always permits in YOLO state', () => {
      vi.mocked(stateManager.detectCurrentState).mockReturnValue('YOLO');
      expect(engine.isToolCallPermitted('write_file', {})).toBe(true);
    });

    it('blocks unpermitted tool in TRACKED state if no manifest allows it', () => {
      vi.mocked(stateManager.detectCurrentState).mockReturnValue('TRACKED');
      
      engine.setActiveManifest({
        meta: { track_id: 't1', generated_at: '', inferred_by: 'auto' },
        capabilities: {
          usb_access: false,
          arbitrary_shell: false,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        },
        allowlist: { shell_prefixes: [], domains: [], paths: [] }
      });
      
      expect(engine.isToolCallPermitted('run_command', { command: 'lsusb' })).toBe(false);
    });

    it('permits if active manifest allows it', () => {
      vi.mocked(stateManager.detectCurrentState).mockReturnValue('TRACKED');
      
      engine.setActiveManifest({
        meta: { track_id: 't1', generated_at: '', inferred_by: 'auto' },
        capabilities: {
          usb_access: true, // lsusb should be allowed
          arbitrary_shell: false,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        },
        allowlist: { shell_prefixes: [], domains: [], paths: [] }
      });

      expect(engine.isToolCallPermitted('run_command', { command: 'lsusb' })).toBe(true);
    });

    describe('SWARM GUARDRAIL', () => {
      it('Root agent write to packages/superconductor-kernel/src/index.ts in TRACKED mode is blocked', () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('TRACKED');
        expect(() => engine.isToolCallPermitted('write_file', { TargetFile: 'packages/superconductor-kernel/src/index.ts' }))
          .toThrow('[Superconductor] Rogue write attempt detected. Aborting. I must dispatch a Processor subagent instead.');
      });

      it('Same write is allowed in YOLO mode (with audit entry)', () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('YOLO');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = engine.isToolCallPermitted('write_file', { TargetFile: 'packages/superconductor-kernel/src/index.ts' });
        expect(result).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith('[Superconductor Audit] Bypassed rogue write prevention due to YOLO mode.');
        warnSpy.mockRestore();
      });

      it('Same write is allowed in IDLE mode', () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('IDLE');
        const result = engine.isToolCallPermitted('write_file', { TargetFile: 'packages/superconductor-kernel/src/index.ts' });
        expect(result).toBe(true);
      });

      it('Write to packages/superconductor-kernel/test/ (not src/) is allowed in TRACKED mode', () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('TRACKED');
        engine.setActiveManifest({
          meta: { track_id: 't1', generated_at: '', inferred_by: 'auto' as const },
          capabilities: { usb_access: false, arbitrary_shell: false, network_unrestricted: false, fs_outside_root: false, persistent: false },
          allowlist: { shell_prefixes: [], domains: [], paths: [] }
        });
        const result = engine.isToolCallPermitted('write_file', { TargetFile: 'packages/superconductor-kernel/test/index.test.ts' });
        expect(result).toBe(true);
      });
    });
  });

  describe('getActiveManifest', () => {
    it('returns null if no manifest is set', () => {
      expect(engine.getActiveManifest()).toBeNull();
    });

    it('returns the active manifest', () => {
      const manifest = {
        meta: { track_id: 't1', generated_at: '', inferred_by: 'auto' as const },
        capabilities: {
          usb_access: false,
          arbitrary_shell: false,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        },
        allowlist: { shell_prefixes: [], domains: [], paths: [] }
      };
      engine.setActiveManifest(manifest);
      expect(engine.getActiveManifest()).toEqual(manifest);
    });
  });
});
