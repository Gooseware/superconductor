import { describe, it, expect, beforeEach } from 'vitest';
import { ImplementorRegistry } from '../../src/dispatcher/implementor-registry.js';
import { WorkUnit, WorkUnitState } from '@superconductor/core/src/track/work-unit.js';

describe('ImplementorRegistry', () => {
  let registry: ImplementorRegistry;

  beforeEach(() => {
    registry = new ImplementorRegistry();
  });

  it('should register an implementor with a work unit', () => {
    const wu: WorkUnit = {
      unitId: 'wu-1',
      domainScope: ['src/components/button.tsx'],
      spec: 'Add disabled state',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-1'
    };

    registry.register('impl-1', wu);
    expect(registry.getWorkUnit('impl-1')).toBe(wu);
  });

  it('should support domain-affinity lookup', () => {
    const wu1: WorkUnit = {
      unitId: 'wu-1',
      domainScope: ['src/components/button.tsx', 'src/components/card.tsx'],
      spec: 'Refactor components',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-1'
    };
    
    const wu2: WorkUnit = {
      unitId: 'wu-2',
      domainScope: ['src/utils/math.ts'],
      spec: 'Add new math utils',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-2'
    };

    registry.register('impl-1', wu1);
    registry.register('impl-2', wu2);

    expect(registry.getImplementorForFile('src/components/button.tsx')).toBe('impl-1');
    expect(registry.getImplementorForFile('src/utils/math.ts')).toBe('impl-2');
    expect(registry.getImplementorForFile('src/unknown.ts')).toBeUndefined();
  });

  it('should not false-positive match prefix strings', () => {
    const authWu: WorkUnit = {
      unitId: 'wu-auth',
      domainScope: ['src/auth'],
      spec: 'Fix auth',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-auth'
    };
    registry.register('impl-auth', authWu);

    // src/authorizer is a different directory, not a subpath of src/auth
    expect(registry.getImplementorForFile('src/authorizer/foo.ts')).toBeUndefined();
    // exact match and sub-path match should still work
    expect(registry.getImplementorForFile('src/auth')).toBe('impl-auth');
    expect(registry.getImplementorForFile('src/auth/foo.ts')).toBe('impl-auth');
  });

  it('should correctly detect architectural drift with overlapping scopes', () => {
    const wu1: WorkUnit = {
      unitId: 'wu-1',
      domainScope: ['src/auth'],
      spec: 'Auth feature',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-1'
    };
    
    const wu2: WorkUnit = {
      unitId: 'wu-2',
      domainScope: ['src/authorizer'], // should NOT drift-error with src/auth
      spec: 'Authorizer feature',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-2'
    };

    const wu3: WorkUnit = {
      unitId: 'wu-3',
      domainScope: ['src/auth/login'], // SHOULD drift-error with src/auth
      spec: 'Login feature',
      state: WorkUnitState.IN_PROGRESS,
      implementorId: 'impl-3'
    };

    registry.register('impl-1', wu1);
    
    // Registering wu2 should succeed, as src/auth doesn't overlap src/authorizer
    expect(() => registry.register('impl-2', wu2)).not.toThrow();

    // Registering wu3 should throw drift error because src/auth/login overlaps with src/auth
    expect(() => registry.register('impl-3', wu3)).toThrow(/Architectural Drift/);
  });
});
