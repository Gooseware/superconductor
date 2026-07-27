import { describe, it, expect } from 'vitest';
import { OracleCadenceOptimiser } from '../../src/intelligence/oracle-cadence-optimiser.js';

describe('OracleCadenceOptimiser', () => {
  it('should compute cadence for 10 tasks, avgTCS=5 to be 2', () => {
    // base Math.ceil(10/4) = 3, TCS modifier Math.floor(5/5) = 1 => Math.max(1, 3-1) = 2
    const cadence = OracleCadenceOptimiser.compute(10, 5);
    expect(cadence).toBe(2);
  });

  it('should compute cadence for 4 tasks, avgTCS=15 (high complexity) to be 1', () => {
    // base Math.ceil(4/4) = 1, TCS modifier Math.floor(15/5) = 3 => Math.max(1, 1-3) = 1
    const cadence = OracleCadenceOptimiser.compute(4, 15);
    expect(cadence).toBe(1);
  });

  it('should reduce cadence by 1 when high retry rate (>0.3) is provided (minimum 1)', () => {
    // 10 tasks, avgTCS=5 (base=3, TCS mod=-1 => 2), retryRate=0.4 (>0.3 => -1) => 1
    const cadenceWithHighRetry = OracleCadenceOptimiser.compute(10, 5, 0.4);
    expect(cadenceWithHighRetry).toBe(1);

    // 10 tasks, avgTCS=0 (base=3, TCS mod=0 => 3), retryRate=0.4 => 2
    const cadenceBaseWithRetry = OracleCadenceOptimiser.compute(10, 0, 0.4);
    expect(cadenceBaseWithRetry).toBe(2);
  });

  it('should never return cadence < 1 even with extreme parameters', () => {
    const cadence = OracleCadenceOptimiser.compute(1, 20, 0.9);
    expect(cadence).toBe(1);
  });

  it('should not apply retry modifier when no retry rate is provided or retry rate <= 0.3', () => {
    // No retry rate
    const cadenceNoRetry = OracleCadenceOptimiser.compute(10, 0);
    expect(cadenceNoRetry).toBe(3);

    // Low retry rate (0.3)
    const cadenceLowRetry = OracleCadenceOptimiser.compute(10, 0, 0.3);
    expect(cadenceLowRetry).toBe(3);
  });

  it('should return cadence=1 when taskCount=0', () => {
    // Math.ceil(0/4) = 0, floored to 1
    const cadence = OracleCadenceOptimiser.compute(0, 0);
    expect(cadence).toBe(1);
  });
});
