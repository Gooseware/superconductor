import { describe, it, expect } from 'vitest';
import { sanitizeId, sanitizePath, sanitizeUntrustedText } from '../../src/utils/input-sanitizer.js';

describe('InputSanitizer', () => {
  describe('sanitizeId', () => {
    it('should replace invalid characters with underscores', () => {
      expect(sanitizeId('valid-id_123')).toBe('valid-id_123');
      expect(sanitizeId('invalid/id')).toBe('invalid_id');
      expect(sanitizeId('id with spaces')).toBe('id_with_spaces');
      expect(sanitizeId('../id')).toBe('___id');
    });

    it('should handle non-strings gracefully', () => {
      expect(sanitizeId(null as any)).toBe('');
      expect(sanitizeId(undefined as any)).toBe('');
    });
  });

  describe('sanitizePath', () => {
    it('should normalize paths and prevent directory traversal', () => {
      expect(sanitizePath('valid/path.txt')).toBe('valid/path.txt');
      expect(sanitizePath('path/./to/file')).toBe('path/to/file');
      expect(sanitizePath('path\0/to/file')).toBe('path/to/file');
      expect(sanitizePath('....//')).toBe('..../');
      expect(sanitizePath('..././')).toBe('.../');
    });

    it('should throw an error for path traversal attempts', () => {
      expect(() => sanitizePath('../../etc/passwd')).toThrow('Path traversal detected');
      expect(() => sanitizePath('../')).toThrow('Path traversal detected');
      expect(() => sanitizePath('/etc/passwd')).toThrow('Path traversal detected');
    });
  });

  describe('sanitizeUntrustedText', () => {
    it('should sanitize XML block breakers', () => {
      expect(sanitizeUntrustedText('Some text ]]>')).toBe('Some text ]] &gt;');
      expect(sanitizeUntrustedText('Text </prompt>')).toBe('Text &lt;/prompt&gt;');
      expect(sanitizeUntrustedText('Null\0Byte')).toBe('NullByte');
    });

    it('should handle adversarial XML tags with spacing', () => {
      expect(sanitizeUntrustedText('</prompt >')).toBe('&lt;/prompt &gt;');
      expect(sanitizeUntrustedText('< / prompt>')).toBe('&lt; / prompt&gt;');
      expect(sanitizeUntrustedText('<<<prompt>>>')).toBe('&lt;&lt;&lt;prompt&gt;&gt;&gt;');
    });
  });
});
