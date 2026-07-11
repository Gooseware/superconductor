import { describe, it, expect, vi } from 'vitest';
import { VerificationPipeline } from '../src/verification/verification-pipeline.js';
import { EventEmitter } from 'events';
import { VlmAuditor } from '../src/verification/vlm-auditor.js';
import { MutationAnalyzer } from '../src/verification/mutation-analyzer.js';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: vi.fn(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
        locator: vi.fn().mockReturnValue({
          screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-locator-screenshot'))
        })
      }),
      close: vi.fn()
    })
  }
}));

describe('Headless Verification Pipeline', () => {
  const mockVlmClient = { invokeVlm: vi.fn() };
  const mockAuditor = new VlmAuditor({ colors: {}, spacing: { baseUnit: 4, scale: {} }, typography: { scale: {} }, components: {} }, mockVlmClient);
  const mockMutationAnalyzer = new MutationAnalyzer(80);

  it('automatically passes phase checkpoints if headless is true and coverage > 80%', async () => {
    const emitter = new EventEmitter();
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer, { headless: true });
    
    // Mock the coverage parser to return 85%
    pipeline.parseCoverage = vi.fn().mockResolvedValue({ passed: true, coverage: 85 });

    const result = await pipeline.runPhaseCheckpoint('phase-1');
    expect(pipeline.parseCoverage).toHaveBeenCalled();
    expect(result.passed).toBe(true);
    expect(result.requiresManualVerification).toBe(false);
  });

  it('fails phase checkpoints and triggers escalation if coverage < 80%', async () => {
    const emitter = new EventEmitter();
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer, { headless: true });
    
    // Mock the coverage parser to return 70%
    pipeline.parseCoverage = vi.fn().mockResolvedValue({ passed: false, coverage: 70, feedback: ['Coverage too low'] });

    const result = await pipeline.runPhaseCheckpoint('phase-1');
    expect(result.passed).toBe(false);
    expect(result.escalated).toBe(true);
    expect(result.feedback).toContain('Coverage too low');
  });

  it('still requires manual verification if headless is false', async () => {
    const emitter = new EventEmitter();
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer, { headless: false });
    
    pipeline.parseCoverage = vi.fn().mockResolvedValue({ passed: true, coverage: 85 });

    const result = await pipeline.runPhaseCheckpoint('phase-1');
    expect(result.passed).toBe(true);
    expect(result.requiresManualVerification).toBe(true);
  });
});
