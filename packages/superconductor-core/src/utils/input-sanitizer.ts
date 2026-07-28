import path from 'path';

export function sanitizeId(id: string): string {
  if (typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function sanitizePath(inputPath: string): string {
  if (typeof inputPath !== 'string') return '';
  const nullStripped = inputPath.replace(/\0/g, '');
  const normalized = path.normalize(nullStripped);
  if (normalized.startsWith('..' + path.sep) || normalized === '..' || path.isAbsolute(normalized)) {
    throw new Error('Path traversal detected');
  }
  return normalized;
}

export function sanitizeUntrustedText(text: string): string {
  if (typeof text !== 'string') return '';
  // Strip null bytes
  let sanitized = text.replace(/\0/g, '');
  // Prompt isolation for XML: Prevent breaking out of CDATA or typical prompt blocks
  sanitized = sanitized.replace(/\]\]>/g, ']] >');
  // Prevent closing XML blocks that could be used in prompt injection
  sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sanitized;
}
