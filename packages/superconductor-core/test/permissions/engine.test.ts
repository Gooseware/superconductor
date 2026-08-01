import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEngine } from '../../src/permissions/engine';
import { TrackStateManager } from '../../src/permissions/track-state';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  let stateManager: TrackStateManager;

  beforeEach(() => {
    stateManager = {
      detectCurrentState: vi.fn(),
      getActiveTrackId: vi.fn()
    } as unknown as TrackStateManager;

    engine = new PolicyEngine(stateManager);
  });

  describe('isToolCallPermitted', () => {
    it('always permits in IDLE state', () => {
      vi.mocked(stateManager.detectCurrentState).mockReturnValue('IDLE');
      expect(engine.isToolCallPermitted('run_command', { command: 'rm -rf /' })).toBe(true);
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
