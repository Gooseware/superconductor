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
});
