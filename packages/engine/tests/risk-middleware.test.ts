import { describe, it, expect } from 'vitest';
import { RiskMiddleware } from '../src/safety/risk-middleware.js';

describe('Semantic Risk Middleware', () => {
  const middleware = new RiskMiddleware();

  it('Read-only commands classified as auto-approve', () => {
    const policy = middleware.evaluate({ type: 'command', command: 'ls -la' });
    expect(policy.action).toBe('auto-approve');
    expect(policy.tier).toBe(1);
  });

  it('Test runners classified as auto-approve', () => {
    const policy = middleware.evaluate({ type: 'command', command: 'npm test' });
    expect(policy.action).toBe('auto-approve');
  });

  it('File writes in src/ classified as auto-approve', () => {
    const policy = middleware.evaluate({ type: 'file_write', path: 'src/index.ts' });
    expect(policy.action).toBe('auto-approve');
    expect(policy.tier).toBe(2);
  });

  it('Modifying config files classified as require-approval', () => {
    const policy = middleware.evaluate({ type: 'file_write', path: 'package.json' });
    expect(policy.action).toBe('require-approval');
    expect(policy.tier).toBe(3);
  });

  it('Shell commands with rm -rf classified as require-approval', () => {
    const policy = middleware.evaluate({ type: 'command', command: 'rm -rf node_modules' });
    expect(policy.action).toBe('require-approval');
    expect(policy.tier).toBeGreaterThanOrEqual(3);
  });

  it('System-level access (e.g., /etc/) classified as block', () => {
    const policyWrite = middleware.evaluate({ type: 'file_write', path: '/etc/hosts' });
    expect(policyWrite.action).toBe('block');
    expect(policyWrite.tier).toBe(5);

    const policyCmd = middleware.evaluate({ type: 'command', command: 'cat /etc/passwd' });
    expect(policyCmd.action).toBe('block');
  });
});
