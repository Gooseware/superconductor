import { describe, it, expect, vi } from 'vitest';
import { redactSecrets, DEFAULT_SECRET_PATTERNS } from '../../src/telemetry/secret-redactor.js';

describe('redactSecrets', () => {
  it('should redact GEMINI_API_KEY env var assignment', () => {
    const input = 'GEMINI_API_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
    const result = redactSecrets(input);
    expect(result).not.toContain('AIzaSy');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact GCP_PROJECT_ID env var', () => {
    const input = 'GCP_PROJECT_ID=my-project-123';
    const result = redactSecrets(input);
    expect(result).not.toContain('my-project-123');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact Bearer token', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123';
    const result = redactSecrets(input);
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('should pass through normal text without secrets unchanged', () => {
    const input = 'Hello, world! This is a normal log message with no secrets.';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });

  it('should redact multiple secrets in one string', () => {
    const input = 'GEMINI_API_KEY=mysecretkey123 and GCP_PROJECT=my-gcp-proj and Bearer tokenvalue123abc';
    const result = redactSecrets(input);
    expect(result).not.toContain('mysecretkey123');
    expect(result).not.toContain('my-gcp-proj');
    expect(result).not.toContain('tokenvalue123abc');
    const redactedCount = (result.match(/\[REDACTED\]/g) || []).length;
    expect(redactedCount).toBeGreaterThanOrEqual(2);
  });

  it('should use only provided custom patterns when given', () => {
    const customPattern = /custom-secret-\d+/g;
    const input = 'GEMINI_API_KEY=shouldNotBeRedacted custom-secret-999';
    // With custom patterns only, the GEMINI_API_KEY pattern won't match
    const result = redactSecrets(input, [customPattern]);
    expect(result).toContain('GEMINI_API_KEY=shouldNotBeRedacted');
    expect(result).not.toContain('custom-secret-999');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact Google API key (AIza... format)', () => {
    const input = 'key=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567';
    const result = redactSecrets(input);
    expect(result).not.toContain('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact OpenAI-style sk- key', () => {
    const input = 'sk-abcdefghijklmnopqrstu';
    const result = redactSecrets(input);
    expect(result).not.toContain('sk-abcdefghijklmnopqrstu');
    expect(result).toContain('[REDACTED]');
  });

  it('should redact password= key-value pair', () => {
    const input = 'password=mysupersecret123';
    const result = redactSecrets(input);
    expect(result).not.toContain('mysupersecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('should not mutate lastIndex state between calls (idempotent)', () => {
    const input = 'GEMINI_API_KEY=abc123456789 GOOGLE_API_KEY=xyz987654321';
    const result1 = redactSecrets(input);
    const result2 = redactSecrets(input);
    expect(result1).toBe(result2);
  });

  it('redacts PEM private keys', () => {
    const input = `-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----`;
    const result = redactSecrets(input);
    expect(result).toBe('[REDACTED]');
    expect(result).not.toContain('BEGIN RSA PRIVATE KEY');
  });

  it('should continue executing remaining patterns if one pattern throws', () => {
    const badPattern = {
      [Symbol.replace]: () => { throw new Error('Bad regex'); },
      lastIndex: 0
    } as unknown as RegExp;

    const goodPattern = /secret/g;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const input = 'my secret is hidden';
    const result = redactSecrets(input, [badPattern, goodPattern]);
    
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[SecretRedactor] Pattern failed, skipping: Bad regex'));
    expect(result).toBe('my [REDACTED] is hidden');
    
    warnSpy.mockRestore();
  });
});
