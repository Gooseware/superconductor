import { describe, it, expect } from 'vitest';
import {
  PermissionStateSchema,
  PermissionManifestSchema,
  CapabilityFlagsSchema,
  SessionFlagsSchema,
  InlineOverrideChoiceSchema
} from '../../src/permissions/schemas';

describe('Permission Schemas', () => {
  describe('PermissionStateSchema', () => {
    it('validates valid states', () => {
      expect(PermissionStateSchema.parse('IDLE')).toBe('IDLE');
      expect(PermissionStateSchema.parse('TRACKED')).toBe('TRACKED');
      expect(PermissionStateSchema.parse('YOLO')).toBe('YOLO');
    });

    it('rejects invalid states', () => {
      expect(() => PermissionStateSchema.parse('INVALID')).toThrow();
    });
  });

  describe('CapabilityFlagsSchema', () => {
    it('validates valid capability flags', () => {
      const valid = {
        usb_access: true,
        arbitrary_shell: false,
        network_unrestricted: false,
        fs_outside_root: true,
        persistent: false
      };
      expect(CapabilityFlagsSchema.parse(valid)).toEqual(valid);
    });

    it('rejects missing fields', () => {
      expect(() => CapabilityFlagsSchema.parse({ usb_access: true })).toThrow();
    });
  });

  describe('PermissionManifestSchema', () => {
    it('validates a complete manifest', () => {
      const manifest = {
        meta: {
          track_id: 'test_track',
          generated_at: new Date().toISOString(),
          inferred_by: 'auto'
        },
        capabilities: {
          usb_access: false,
          arbitrary_shell: true,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        },
        allowlist: {
          shell_prefixes: ['npm run'],
          domains: ['example.com'],
          paths: ['/tmp']
        }
      };
      expect(PermissionManifestSchema.parse(manifest)).toEqual(manifest);
    });

    it('validates a manifest with missing allowlists and optional fields', () => {
      const manifest = {
        meta: {
          track_id: 'test_track',
          generated_at: new Date().toISOString(),
          inferred_by: 'manual'
        },
        capabilities: {
          usb_access: false,
          arbitrary_shell: false,
          network_unrestricted: false,
          fs_outside_root: false,
          persistent: false
        }
      };
      const parsed = PermissionManifestSchema.parse(manifest);
      expect(parsed.allowlist).toBeDefined();
      expect(parsed.allowlist?.shell_prefixes).toEqual([]);
    });
  });

  describe('SessionFlagsSchema', () => {
    it('validates valid session flags', () => {
      const valid = {
        yolo: true,
        activatedAt: new Date().toISOString(),
        sessionId: 'session-123',
        persistent: true
      };
      expect(SessionFlagsSchema.parse(valid)).toEqual(valid);
    });
  });

  describe('InlineOverrideChoiceSchema', () => {
    it('validates choices', () => {
      expect(InlineOverrideChoiceSchema.parse('allow_once')).toBe('allow_once');
      expect(InlineOverrideChoiceSchema.parse('allow_track')).toBe('allow_track');
      expect(InlineOverrideChoiceSchema.parse('yolo_session')).toBe('yolo_session');
      expect(InlineOverrideChoiceSchema.parse('deny')).toBe('deny');
    });
  });
});
