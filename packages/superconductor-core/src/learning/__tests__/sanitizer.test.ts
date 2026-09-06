import { describe, it, expect } from 'vitest';
import { TrajectorySanitizer, SanitizerOptions } from '../sanitizer.js';

describe('TrajectorySanitizer', () => {
  describe('ANSI Escape Sequence Stripping', () => {
    it('strips basic ANSI color escape codes from text', () => {
      const input = '\x1b[31mError:\x1b[0m Something went wrong';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Error: Something went wrong');
    });

    it('strips complex multi-parameter ANSI formatting sequences', () => {
      const input = '\x1b[1;32;40m[SUCCESS]\x1b[0m Task completed at \x1b[4m2026-09-06\x1b[24m';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('[SUCCESS] Task completed at 2026-09-06');
    });

    it('strips ANSI codes embedded directly adjacent to tokens', () => {
      const input = '\x1b[33mdfp_secretDeerFlowToken12345\x1b[39m';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('[REDACTED]');
      expect(output).not.toContain('\x1b');
      expect(output).not.toContain('dfp_secretDeerFlowToken12345');
    });
  });

  describe('API Token Redaction', () => {
    it('redacts DeerFlow API tokens (dfp_*)', () => {
      const input = 'Connecting with token dfp_9876543210abcdefABCDEF to server';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Connecting with token [REDACTED] to server');
      expect(output).not.toContain('dfp_9876543210abcdefABCDEF');
    });

    it('redacts GitHub personal access tokens (ghp_*)', () => {
      const input = 'git push https://ghp_1234567890abcdefghijklmnopqrstuvwxyzAB@github.com/repo.git';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('git push https://[REDACTED]@github.com/repo.git');
      expect(output).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyzAB');
    });

    it('redacts GitHub fine-grained and other token formats (github_pat_*, gho_*, ghu_*)', () => {
      const input = 'Using github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyz and gho_abc123456789';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Using [REDACTED] and [REDACTED]');
    });

    it('redacts OpenAI API keys (sk-*)', () => {
      const input = 'export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234567890';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
    });

    it('redacts OpenAI project-scoped API keys (sk-proj-*)', () => {
      const input = 'Bearer sk-proj-1234567890abcdefghijklmnopqrstuvwxyz';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Bearer [REDACTED]');
      expect(output).not.toContain('sk-proj-1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('redacts Gemini API keys (AIza*)', () => {
      const input = 'geminiKey: AIzaSyD1234567890abcdefghijklmnopqrstuvw in params';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('geminiKey: [REDACTED] in params');
      expect(output).not.toContain('AIzaSyD1234567890abcdefghijklmnopqrstuvw');
    });

    it('redacts multiple different API keys within the same string', () => {
      const input = 'DeerFlow: dfp_aaa111, OpenAI: sk-bbb222, Gemini: AIzaSyD1234567890abcdefghijklmnopqrstuvw';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('DeerFlow: [REDACTED], OpenAI: [REDACTED], Gemini: [REDACTED]');
    });
  });

  describe('JWT and Header Redaction', () => {
    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const input = `User session token: ${jwt}`;
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('User session token: [REDACTED]');
      expect(output).not.toContain(jwt);
    });

    it('redacts Authorization Bearer headers', () => {
      const input = 'Authorization: Bearer mySecretAccessTokenValue12345';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Authorization: Bearer [REDACTED]');
      expect(output).not.toContain('mySecretAccessTokenValue12345');
    });

    it('redacts case-insensitive bearer tokens', () => {
      const input = 'authorization: bearer some-random-opaque-token-999';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('authorization: bearer [REDACTED]');
      expect(output).not.toContain('some-random-opaque-token-999');
    });

    it('redacts standalone Bearer tokens', () => {
      const input = 'Bearer secret-standalone-token-42';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Bearer [REDACTED]');
      expect(output).not.toContain('secret-standalone-token-42');
    });
  });

  describe('Private Keys and Sensitive Environment Tokens', () => {
    it('redacts multiline RSA private keys', () => {
      const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+examplePrivateKeyValue
AnotherLineOfEncryptedData==
-----END RSA PRIVATE KEY-----`;
      const input = `Server key config:\n${privateKey}\nProceeding with startup...`;
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(output).not.toContain('examplePrivateKeyValue');
      expect(output).toContain('[REDACTED]');
      expect(output).toContain('Proceeding with startup...');
    });

    it('redacts generic PRIVATE KEY blocks', () => {
      const privateKey = `-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...\n-----END PRIVATE KEY-----`;
      const input = `Certificate: ${privateKey}`;
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Certificate: [REDACTED]');
    });

    it('redacts OPENSSH PRIVATE KEY blocks', () => {
      const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAA...\n-----END OPENSSH PRIVATE KEY-----`;
      const input = `SSH identity: ${privateKey}`;
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('SSH identity: [REDACTED]');
    });

    it('redacts sensitive environment variable assignments (*_API_KEY=, *_TOKEN=, *_SECRET=)', () => {
      const input = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY and SLACK_TOKEN=xoxb-123456789-abcdef and STRIPE_API_KEY=rk_live_012345';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED]');
      expect(output).toContain('SLACK_TOKEN=[REDACTED]');
      expect(output).toContain('STRIPE_API_KEY=[REDACTED]');
      expect(output).not.toContain('wJalrXUtnFEMI');
      expect(output).not.toContain('xoxb-123456789');
      expect(output).not.toContain('rk_live_012345');
    });

    it('redacts quoted environment variable assignments', () => {
      const input = 'export DATABASE_PASSWORD="SuperSecretPassword#123" && export APP_SECRET=\'my-app-secret-token\'';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toContain('DATABASE_PASSWORD="[REDACTED]"');
      expect(output).toContain("APP_SECRET='[REDACTED]'");
      expect(output).not.toContain('SuperSecretPassword#123');
      expect(output).not.toContain('my-app-secret-token');
    });

    it('redacts password key-value assignments in logs and config text', () => {
      const input = 'Connecting with password: myPlaintextPassword! to postgres';
      const output = TrajectorySanitizer.sanitize(input);
      expect(output).toBe('Connecting with password: [REDACTED] to postgres');
      expect(output).not.toContain('myPlaintextPassword!');
    });
  });

  describe('Field Length Truncation', () => {
    it('truncates strings exceeding default 5000 characters', () => {
      const longText = 'A'.repeat(6000);
      const output = TrajectorySanitizer.sanitize(longText);
      expect(output.length).toBe(5000 + '... [truncated 1000 chars]'.length);
      expect(output.endsWith('... [truncated 1000 chars]')).toBe(true);
      expect(output.startsWith('A'.repeat(5000))).toBe(true);
    });

    it('does not truncate strings shorter than maxFieldLength', () => {
      const shortText = 'Hello world!';
      const output = TrajectorySanitizer.sanitize(shortText, { maxFieldLength: 50 });
      expect(output).toBe('Hello world!');
    });

    it('truncates to custom maxFieldLength and reports exact overflow character count', () => {
      const text = 'abcdefghijklmnopqrstuvwxyz'; // 26 chars
      const output = TrajectorySanitizer.sanitize(text, { maxFieldLength: 10 });
      expect(output).toBe('abcdefghij... [truncated 16 chars]');
    });

    it('redacts secrets BEFORE truncating to prevent secret leakage at truncation boundary', () => {
      const prefix = 'A'.repeat(10);
      const secret = 'sk-1234567890abcdef123456';
      const suffix = 'B'.repeat(50);
      const text = `${prefix} ${secret} ${suffix}`;
      const output = TrajectorySanitizer.sanitize(text, { maxFieldLength: 30 });
      expect(output).not.toContain('sk-1234567890abcdef123456');
      expect(output).toContain('[REDACTED]');
      expect(output).toContain('... [truncated');
    });

    it('disables truncation when maxFieldLength is 0 or negative', () => {
      const longText = 'A'.repeat(7000);
      const output = TrajectorySanitizer.sanitize(longText, { maxFieldLength: 0 });
      expect(output).toBe(longText);
    });
  });

  describe('Custom Redaction Mask', () => {
    it('uses custom redactionMask when provided in options', () => {
      const input = 'API key is dfp_mySecret123';
      const output = TrajectorySanitizer.sanitize(input, { redactionMask: '<HIDDEN>' });
      expect(output).toBe('API key is <HIDDEN>');
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes strings inside nested objects and arrays', () => {
      const input = {
        name: 'test-agent',
        config: {
          endpoint: 'https://api.example.com',
          apiKeyPrompt: 'Please use dfp_deerFlowSecretKey999',
        },
        tags: ['v1', '\x1b[32mhealthy\x1b[0m', 'token: sk-openAiToken1234567'],
      };

      const result = TrajectorySanitizer.sanitizeObject(input);

      expect(result.name).toBe('test-agent');
      expect(result.config.endpoint).toBe('https://api.example.com');
      expect(result.config.apiKeyPrompt).toBe('Please use [REDACTED]');
      expect(result.tags[0]).toBe('v1');
      expect(result.tags[1]).toBe('healthy');
      expect(result.tags[2]).toBe('token: [REDACTED]');
    });

    it('redacts sensitive key-value pairs entirely based on key names', () => {
      const input = {
        username: 'alice',
        password: 'PlainTextPassword123',
        clientSecret: 'secret_value_xyz',
        accessToken: 'opaque_access_token',
        apiKey: 'sk-abcdef123456',
        private_key: 'some_key_data',
      };

      const result = TrajectorySanitizer.sanitizeObject(input);

      expect(result.username).toBe('alice');
      expect(result.password).toBe('[REDACTED]');
      expect(result.clientSecret).toBe('[REDACTED]');
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.private_key).toBe('[REDACTED]');
    });

    it('redacts custom sensitive keys passed in SanitizerOptions', () => {
      const input = {
        username: 'bob',
        customVaultCredential: 'super-secret-vault-string',
      };

      const result = TrajectorySanitizer.sanitizeObject(input, {
        sensitiveKeys: ['customVaultCredential'],
      });

      expect(result.username).toBe('bob');
      expect(result.customVaultCredential).toBe('[REDACTED]');
    });

    it('handles primitive types, null, and undefined gracefully', () => {
      expect(TrajectorySanitizer.sanitizeObject(null)).toBeNull();
      expect(TrajectorySanitizer.sanitizeObject(undefined)).toBeUndefined();
      expect(TrajectorySanitizer.sanitizeObject(42)).toBe(42);
      expect(TrajectorySanitizer.sanitizeObject(true)).toBe(true);
      expect(TrajectorySanitizer.sanitizeObject('hello dfp_12345')).toBe('hello [REDACTED]');
    });

    it('handles circular references without throwing or infinite recursion', () => {
      const circular: any = {
        name: 'circular-node',
        nested: {},
      };
      circular.nested.parent = circular;

      expect(() => {
        const result = TrajectorySanitizer.sanitizeObject(circular);
        expect(result.name).toBe('circular-node');
        expect(result.nested.parent).toBe('[Circular]');
      }).not.toThrow();
    });

    it('ensures immutability: deep clones and does not mutate the original object', () => {
      const original = {
        user: {
          name: 'Charlie',
          password: 'SecretCharliePassword',
          tokens: ['dfp_secretTokenVal123'],
        },
        env: {
          OPENAI_API_KEY: 'sk-1234567890abcdef123456',
        },
      };

      const originalClone = JSON.parse(JSON.stringify(original));
      const sanitized = TrajectorySanitizer.sanitizeObject(original);

      // Verify original is completely unchanged
      expect(original).toEqual(originalClone);
      expect(original.user.password).toBe('SecretCharliePassword');
      expect(original.user.tokens[0]).toBe('dfp_secretTokenVal123');
      expect(original.env.OPENAI_API_KEY).toBe('sk-1234567890abcdef123456');

      // Verify sanitized has distinct references
      expect(sanitized).not.toBe(original);
      expect(sanitized.user).not.toBe(original.user);
      expect(sanitized.user.tokens).not.toBe(original.user.tokens);
      expect(sanitized.env).not.toBe(original.env);

      // Verify sanitized values are redacted
      expect(sanitized.user.password).toBe('[REDACTED]');
      expect(sanitized.user.tokens[0]).toBe('[REDACTED]');
      expect(sanitized.env.OPENAI_API_KEY).toBe('[REDACTED]');
    });
  });
});
