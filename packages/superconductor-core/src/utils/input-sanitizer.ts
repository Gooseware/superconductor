export function sanitizeId(id: string): string {
  if (typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function sanitizePath(inputPath: string): string {
  if (typeof inputPath !== 'string') return '';
  // Basic path traversal sanitation
  return inputPath.replace(/\0/g, '').replace(/\.\./g, '').replace(/\/\./g, '/');
}

export function sanitizeUntrustedText(text: string): string {
  if (typeof text !== 'string') return '';
  // Strip null bytes
  let sanitized = text.replace(/\0/g, '');
  // Prompt isolation for XML: Prevent breaking out of CDATA or typical prompt blocks
  sanitized = sanitized.replace(/\]\]>/g, ']] >');
  // Prevent closing XML blocks that could be used in prompt injection
  sanitized = sanitized.replace(/<\/[a-zA-Z0-9_-]+>/g, (match) => {
    return match.replace('<', '&lt;').replace('>', '&gt;');
  });
  return sanitized;
}
