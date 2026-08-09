import { describe, it, expect } from 'vitest';
import { ModelRoutingEnforcer } from './model-routing-enforcer.js';

describe('ModelRoutingEnforcer', () => {
  const enforcer = new ModelRoutingEnforcer();

  it('resolveModel("superconductor-oracle", any) returns "pro"', () => {
    expect(enforcer.resolveModel('superconductor-oracle', { complexity: 'low', worktreeIsolated: true })).toBe('pro');
    expect(enforcer.resolveModel('superconductor-oracle', {})).toBe('pro');
    expect(enforcer.resolveModel('superconductor-oracle')).toBe('pro');
    expect(ModelRoutingEnforcer.resolveModel('superconductor-oracle')).toBe('pro');
  });

  it('resolveModel("superconductor-dreamer", any) returns "pro"', () => {
    expect(enforcer.resolveModel('superconductor-dreamer', { complexity: 'low', worktreeIsolated: true })).toBe('pro');
    expect(enforcer.resolveModel('superconductor-dreamer', {})).toBe('pro');
    expect(enforcer.resolveModel('superconductor-dreamer')).toBe('pro');
    expect(ModelRoutingEnforcer.resolveModel('superconductor-dreamer')).toBe('pro');
  });

  it('resolveModel("superconductor-processor", { complexity: "high" }) returns "pro" if no worktree', () => {
    expect(enforcer.resolveModel('superconductor-processor', { complexity: 'high' })).toBe('pro');
    expect(enforcer.resolveModel('superconductor-processor', { complexity: 'high', worktreeIsolated: false })).toBe('pro');
  });

  it('resolveModel("superconductor-processor", { complexity: "low", worktreeIsolated: true }) returns "flash"', () => {
    expect(enforcer.resolveModel('superconductor-processor', { complexity: 'low', worktreeIsolated: true })).toBe('flash');
    expect(enforcer.resolveModel('superconductor-processor', { worktreeIsolated: true })).toBe('flash');
  });

  it('resolveModel for reviewer or unknown returns "flash"', () => {
    expect(enforcer.resolveModel('superconductor-reviewer')).toBe('flash');
    expect(enforcer.resolveModel('unknown-agent')).toBe('flash');
  });

  it('escalate(agentId, failCount: 2) returns "pro"', () => {
    expect(enforcer.escalate('superconductor-processor', 2)).toBe('pro');
    expect(enforcer.escalate('superconductor-processor', 3)).toBe('pro');
    expect(ModelRoutingEnforcer.escalate('superconductor-processor', 2)).toBe('pro');
  });

  it('escalate(agentId, failCount: 1) returns "flash"', () => {
    expect(enforcer.escalate('superconductor-processor', 1)).toBe('flash');
    expect(enforcer.escalate('superconductor-processor', 0)).toBe('flash');
    expect(ModelRoutingEnforcer.escalate('superconductor-processor', 1)).toBe('flash');
  });
});
