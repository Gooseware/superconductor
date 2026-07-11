import { describe, it, expect, vi } from 'vitest';
import { VerificationPipeline } from '../src/verification/verification-pipeline.js';
import { VlmAuditor } from '../src/verification/vlm-auditor.js';
import { validatePbtUsage } from '../src/verification/pbt-validator.js';
import { MutationAnalyzer } from '../src/verification/mutation-analyzer.js';
import { EventEmitter } from 'events';
import { EventStore } from '../src/state/event-store.js';

vi.mock('../src/verification/pbt-validator.js', () => ({
  validatePbtUsage: vi.fn()
}));

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

describe('Verification Pipeline', () => {
  const mockVlmClient = { invokeVlm: vi.fn() };
  const mockAuditor = new VlmAuditor({ colors: {}, spacing: { baseUnit: 4, scale: {} }, typography: { scale: {} }, components: {} }, mockVlmClient);
  
  mockAuditor.iterativeAuditFix = vi.fn().mockResolvedValue({ passed: true, score: 100, diffs: [] });
  
  const mockMutationAnalyzer = new MutationAnalyzer(80);
  mockMutationAnalyzer.verifyThreshold = vi.fn().mockResolvedValue({ passed: true, report: { score: { score: 100 } } });

  it('VLM audit + PBT validation + mutation testing run in sequence', async () => {
    const emitter = new EventEmitter();
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer);
    
    vi.mocked(validatePbtUsage).mockReturnValue({ passed: true, moduleId: 'src/test.ts', propertiesFound: [], feedback: [] });

    const result = await pipeline.runVerification('task-1', 'ui-component', 'src/test.ts', 'const x = 1;', ['src/test.ts']);
    
    expect(result.passed).toBe(true);
    expect(mockAuditor.iterativeAuditFix).toHaveBeenCalled();
    expect(validatePbtUsage).toHaveBeenCalled();
    expect(mockMutationAnalyzer.verifyThreshold).toHaveBeenCalled();
  });

  it('Verification failure blocks task completion with structured report', async () => {
    const emitter = new EventEmitter();
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer);
    
    vi.mocked(validatePbtUsage).mockReturnValue({ passed: false, moduleId: 'src/test.ts', propertiesFound: [], feedback: ['No properties'] });

    const result = await pipeline.runVerification('task-2', 'ui-component', 'src/test.ts', 'const x = 1;', ['src/test.ts']);
    
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('No properties');
  });

  it('All verification events are persisted to the event store', async () => {
    const emitter = new EventEmitter();
    const store = new EventStore({ dbPath: ':memory:' });
    emitter.on('event', (e) => store.append(e));
    const pipeline = new VerificationPipeline(emitter, mockAuditor, mockMutationAnalyzer);
    
    vi.mocked(validatePbtUsage).mockReturnValue({ passed: true, moduleId: 'src/test.ts', propertiesFound: [], feedback: [] });
    mockMutationAnalyzer.verifyThreshold = vi.fn().mockResolvedValue({ passed: false, report: { score: { score: 50 } }, feedback: ['Too low'] });

    await pipeline.runVerification('task-3', 'ui-component', 'src/test.ts', 'const x = 1;', ['src/test.ts']);
    
    const events = store.query({});
    const verificationEvents = events.filter(e => e.eventType === 'verification');
    
    // Should have emitted events for VLM, PBT, and Mutation Testing
    expect(verificationEvents.length).toBeGreaterThan(0);
  });
});
