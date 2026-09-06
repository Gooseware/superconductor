/**
 * TrajectorySanitizer
 *
 * Sanitizes and redacts sensitive data (API tokens, passwords, private keys,
 * environment tokens, ANSI escape codes) from execution traces and trajectory logs.
 */

export interface SanitizerOptions {
  /**
   * Maximum length allowed for string fields before truncating.
   * Default is 5000. If 0 or negative, truncation is disabled.
   */
  maxFieldLength?: number;

  /**
   * Mask string used to replace sensitive tokens.
   * Default is '[REDACTED]'.
   */
  redactionMask?: string;

  /**
   * Additional field key names that should be treated as sensitive in object structures.
   */
  sensitiveKeys?: string[];
}

export class TrajectorySanitizer {
  private static readonly DEFAULT_MASK = '[REDACTED]';
  private static readonly DEFAULT_MAX_FIELD_LENGTH = 5000;

  /**
   * Sanitize a text string by stripping ANSI escape sequences,
   * redacting API keys, private keys, passwords, and sensitive env tokens,
   * and truncating overflow text if maxFieldLength is exceeded.
   */
  public static sanitize(text: string, options?: SanitizerOptions): string {
    if (typeof text !== 'string') {
      return '';
    }

    if (!text) {
      return text;
    }

    const mask = options?.redactionMask ?? this.DEFAULT_MASK;

    // 1. Strip ANSI escape sequences (\x1b\[[0-9;]*[a-zA-Z])
    let scrubbed = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

    // 2. Redact multiline and unclosed private keys
    scrubbed = scrubbed.replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      mask
    );
    scrubbed = scrubbed.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[^\r\n]*/g, mask);

    // 3. Redact environment variable tokens (*_API_KEY=..., *_TOKEN=..., *_SECRET=..., *_PASSWORD=...)
    scrubbed = scrubbed.replace(
      /(\b[A-Za-z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY)[A-Za-z0-9_]*\s*=\s*)(?:(['"])(.*?)\2|([^\s,"'\`]+))/gi,
      (_match, prefix, quote) => {
        if (quote) {
          return `${prefix}${quote}${mask}${quote}`;
        }
        return `${prefix}${mask}`;
      }
    );

    // 4. Redact password key-value assignments in logs and config text
    scrubbed = scrubbed.replace(
      /((?:["']?)(?:password|passwd|pwd)(?:["']?)\s*[:=]\s*)(?:(['"])(.*?)\2|([^\s,"'\`\}]+))/gi,
      (_match, prefix, quote) => {
        if (quote) {
          return `${prefix}${quote}${mask}${quote}`;
        }
        return `${prefix}${mask}`;
      }
    );

    // 5. Redact Authorization & Bearer headers
    scrubbed = scrubbed.replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, `$1${mask}`);
    scrubbed = scrubbed.replace(/(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]+/gi, `$1${mask}`);
    scrubbed = scrubbed.replace(
      /(Authorization:\s*)(?!Bearer|Basic|\[REDACTED\])[^\s,"'\`]+/gi,
      `$1${mask}`
    );

    // 6. Redact API tokens
    // DeerFlow tokens: dfp_[A-Za-z0-9]+
    scrubbed = scrubbed.replace(/\bdfp_[A-Za-z0-9_-]+\b/g, mask);

    // GitHub tokens: ghp_*, gho_*, ghu_*, ghs_*, ghr_*, github_pat_*
    scrubbed = scrubbed.replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)\b/g,
      mask
    );

    // OpenAI API keys: sk-*, sk-proj-*, sk-admin-*, sk-ant-*
    scrubbed = scrubbed.replace(/\bsk-(?:proj-|admin-|ant-)?[A-Za-z0-9_-]{10,}\b/g, mask);
    scrubbed = scrubbed.replace(/\bsk-[A-Za-z0-9]+\b/g, mask);

    // Gemini API keys: AIza[0-9A-Za-z-_]{35}
    scrubbed = scrubbed.replace(/\bAIza[0-9A-Za-z-_]{35,}\b/g, mask);

    // JWT tokens: ey[A-Za-z0-9-_]+\.ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+
    scrubbed = scrubbed.replace(
      /\bey[A-Za-z0-9-_]{10,}\.ey[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]+\b/g,
      mask
    );

    // 7. Field length truncation
    const maxLen =
      options?.maxFieldLength !== undefined
        ? options.maxFieldLength
        : this.DEFAULT_MAX_FIELD_LENGTH;

    if (maxLen > 0 && scrubbed.length > maxLen) {
      const overflow = scrubbed.length - maxLen;
      scrubbed = `${scrubbed.slice(0, maxLen)}... [truncated ${overflow} chars]`;
    }

    return scrubbed;
  }

  /**
   * Deeply sanitizes an object, preserving immutability by creating a cloned structure.
   * Redacts sensitive keys entirely and scrubs any string fields.
   */
  public static sanitizeObject<T>(obj: T, options?: SanitizerOptions): T {
    const visited = new Set<any>();
    return this.internalSanitizeObject(obj, options, visited);
  }

  private static internalSanitizeObject<T>(
    obj: T,
    options?: SanitizerOptions,
    visited?: Set<any>
  ): any {
    if (typeof obj === 'string') {
      return this.sanitize(obj, options);
    }

    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }

    const seen = visited ?? new Set<any>();
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      const arrResult = obj.map(item =>
        this.internalSanitizeObject(item, options, seen)
      );
      seen.delete(obj);
      return arrResult;
    }

    const mask = options?.redactionMask ?? this.DEFAULT_MASK;
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveKey(key, options)) {
        result[key] = mask;
      } else {
        result[key] = this.internalSanitizeObject(value, options, seen);
      }
    }

    seen.delete(obj);
    return result;
  }

  /**
   * Evaluates if a given object key name is sensitive.
   */
  private static isSensitiveKey(key: string, options?: SanitizerOptions): boolean {
    if (options?.sensitiveKeys && options.sensitiveKeys.length > 0) {
      const keyLower = key.toLowerCase();
      if (options.sensitiveKeys.some(k => k.toLowerCase() === keyLower)) {
        return true;
      }
    }

    const patterns = [
      /(?:^|[a-z0-9_])pass(?:word|wd)(?:[_-]?hash)?$/i,
      /(?:^|[a-z0-9_])secret(?:[_-]?key)?$/i,
      /(?:^|[a-z0-9_])api[_-]?key$/i,
      /(?:^|[a-z0-9_])private[_-]?key$/i,
      /(?:^|[a-z0-9_])token$/i,
      /(?:^|[a-z0-9_])credentials?$/i,
      /(?:^|[a-z0-9_])authorization$/i,
    ];

    return patterns.some(pattern => pattern.test(key));
  }
}
