import { describe, it, expect } from 'vitest';
import { TrackLifecycleWizard } from '../track-lifecycle-wizard.js';

describe('TrackLifecycleWizard (Planning Re-export & Blast Radius)', () => {
  it('instantiates TrackLifecycleWizard via planning module re-export', () => {
    const wizard = new TrackLifecycleWizard();
    expect(wizard).toBeDefined();
    expect(typeof wizard.generateBlastRadiusSection).toBe('function');
    expect(typeof wizard.extractUpgradePlanTasks).toBe('function');
  });

  it('generates blast radius markdown section and UPGRADES plan tasks', async () => {
    const wizard = new TrackLifecycleWizard();
    const result = await wizard.generateBlastRadiusSection({
      changedFiles: ['src/core/auth.ts'],
    });

    expect(result.markdown).toContain('## Impacted Downstream & Upgrade Opportunities');
    expect(result.markdown).toContain('### PROTECTED: Downstream Consumers');
    expect(result.markdown).toContain('### UPGRADES: Upgrade Candidates');
    expect(result.planTasks.length).toBeGreaterThan(0);

    const task = result.planTasks[0];
    expect(task).toContain('UPGRADES: src/legacy/old-auth.ts');
    expect(task).toContain('PROTECTED:');
    expect(task).toContain('INVARIANT_AFTER:');
  });
});
