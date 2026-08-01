import { describe, it, expect } from 'vitest';
import { KeywordPermissionInferrer } from '../../src/permissions/keyword-inferrer';

describe('KeywordPermissionInferrer', () => {
  it('should infer usb_access when hardware keywords are present', () => {
    const text = 'We need to use lsusb and access /dev/bus/usb for the hardware.';
    const manifest = KeywordPermissionInferrer.inferCapabilities(text);
    expect(manifest.usb_access).toBe(true);
  });

  it('should infer arbitrary_shell when shell keywords are present', () => {
    const text = 'This script will execute arbitrary bash scripts to configure the machine.';
    const manifest = KeywordPermissionInferrer.inferCapabilities(text);
    expect(manifest.arbitrary_shell).toBe(true);
  });

  it('should infer network_unrestricted for network keywords', () => {
    const text = 'It will download data from random external domains and curl arbitrary endpoints.';
    const manifest = KeywordPermissionInferrer.inferCapabilities(text);
    expect(manifest.network_unrestricted).toBe(true);
  });

  it('should infer fs_outside_root for outside FS keywords', () => {
    const text = 'Reads config from /etc/config and writes to ~/.gemini/';
    const manifest = KeywordPermissionInferrer.inferCapabilities(text);
    expect(manifest.fs_outside_root).toBe(true);
  });

  it('should default to false for all capabilities if no keywords are matched', () => {
    const text = 'Just a normal track that writes a basic hello world in the local folder.';
    const manifest = KeywordPermissionInferrer.inferCapabilities(text);
    expect(manifest.usb_access).toBe(false);
    expect(manifest.arbitrary_shell).toBe(false);
    expect(manifest.network_unrestricted).toBe(false);
    expect(manifest.fs_outside_root).toBe(false);
    expect(manifest.persistent).toBe(false);
  });
});
