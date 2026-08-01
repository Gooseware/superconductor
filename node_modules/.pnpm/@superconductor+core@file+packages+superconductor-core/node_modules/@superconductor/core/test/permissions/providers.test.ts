import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { PermissionManifestParser } from '../../src/permissions/providers/toml-provider';
import { SessionProvider } from '../../src/permissions/providers/session-provider';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  renameSync: vi.fn()
}));

describe('Permission Providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('PermissionManifestParser', () => {
    it('parses valid TOML manifest', () => {
      const validToml = `
        [meta]
        track_id = "test-track"
        generated_at = "2026-08-01T00:00:00Z"
        inferred_by = "auto"

        [capabilities]
        usb_access = true
        arbitrary_shell = false
        network_unrestricted = false
        fs_outside_root = false
        persistent = false

        [allowlist]
        shell_prefixes = ["npm test"]
        domains = []
        paths = []
      `;
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(validToml);

      const parser = new PermissionManifestParser('/path/to/manifest.toml');
      const manifest = parser.read();

      expect(manifest).not.toBeNull();
      expect(manifest?.meta.track_id).toBe('test-track');
      expect(manifest?.capabilities.usb_access).toBe(true);
      expect(manifest?.allowlist?.shell_prefixes).toEqual(['npm test']);
    });

    it('writes TOML manifest correctly', () => {
      const parser = new PermissionManifestParser('/path/to/manifest.toml');
      parser.write({
        meta: { track_id: 'test-track', generated_at: '2026-08-01', inferred_by: 'manual' },
        capabilities: {
          usb_access: false,
          arbitrary_shell: true,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        },
        allowlist: { shell_prefixes: [], domains: [], paths: [] }
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const content = (fs.writeFileSync as any).mock.calls[0][1];
      expect(content).toContain('track_id = "test-track"');
      expect(content).toContain('arbitrary_shell = true');
    });

    it('updates capability correctly', () => {
      const parser = new PermissionManifestParser('/path/to/manifest.toml');
      
      const existing = `
        [meta]
        track_id = "test-track"
        generated_at = "2026-08-01T00:00:00Z"
        inferred_by = "auto"

        [capabilities]
        usb_access = false
        arbitrary_shell = false
        network_unrestricted = false
        fs_outside_root = false
        persistent = false
      `;
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(existing);

      parser.updateCapability('usb_access', true);

      const content = (fs.writeFileSync as any).mock.calls[0][1];
      expect(content).toContain('usb_access = true');
    });
  });

  describe('SessionProvider', () => {
    it('reads valid session flags', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({
        yolo: true,
        activatedAt: '2026-08-01T00:00:00Z',
        sessionId: '123',
        persistent: true
      }));

      const provider = new SessionProvider('/path/to/session.json');
      const flags = provider.read();

      expect(flags).not.toBeNull();
      expect(flags?.yolo).toBe(true);
    });

    it('writes session flags atomically', () => {
      const provider = new SessionProvider('/path/to/session.json');
      provider.write({
        yolo: true,
        activatedAt: '2026-08-01T00:00:00Z',
        sessionId: '123',
        persistent: true
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith('/path/to/session.json.tmp', expect.any(String), 'utf-8');
      expect(fs.renameSync).toHaveBeenCalledWith('/path/to/session.json.tmp', '/path/to/session.json');
    });
  });
});
