import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VlmAuditor } from '../src/verification/vlm-auditor.js';
import { DesignSchema } from '../src/verification/vlm-auditor.types.js';

const mocks = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image-data')),
    locator: vi.fn().mockReturnValue({
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-component-image'))
    }),
  };

  const mockBrowser = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn()
  };

  return { mockPage, mockBrowser };
});

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mocks.mockBrowser)
  }
}));

describe('Headless VLM Auditor', () => {
  let auditor: VlmAuditor;
  const mockSchema: DesignSchema = {
    colors: { primary: '#ff0000' },
    spacing: { baseUnit: 4, scale: { medium: 16 } },
    typography: { scale: { p: { fontSize: '16px', lineHeight: '24px', fontWeight: 'normal' } } },
    components: {}
  };

  beforeEach(() => {
    auditor = new VlmAuditor(mockSchema, {
      invokeVlm: vi.fn() // Mock the VLM call
    });
    vi.clearAllMocks();
  });

  it('Playwright script captures DOM screenshot for a rendered component', async () => {
    const result = await auditor.captureScreenshot('http://localhost:3000/test-component');
    
    expect(mocks.mockBrowser.newPage).toHaveBeenCalled();
    expect(mocks.mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/test-component', { waitUntil: 'networkidle' });
    expect(mocks.mockPage.screenshot).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('Audit report flags non-compliant color usage', async () => {
    // Mock the VLM returning an audit result with a failure
    auditor['vlmClient'].invokeVlm = vi.fn().mockResolvedValue({
      passed: false,
      score: 80,
      diffs: [{
        elementSelector: '.button',
        expected: 'color: #ff0000',
        actual: 'color: #0000ff',
        severity: 'high'
      }],
      suggestions: ['Change button color to primary (#ff0000)']
    });

    const report = await auditor.auditComponent('http://localhost:3000/button', 'ButtonComponent');
    
    expect(report.passed).toBe(false);
    expect(report.diffs.length).toBeGreaterThan(0);
    expect(report.diffs[0].expected).toContain('#ff0000');
  });

  it('Iterative fix loop terminates after max 3 iterations', async () => {
    // Always returns a failed audit
    auditor['vlmClient'].invokeVlm = vi.fn().mockResolvedValue({
      passed: false,
      score: 50,
      diffs: [{}],
      suggestions: ['Fix something']
    });

    const fixCallback = vi.fn().mockResolvedValue(undefined);

    const result = await auditor.iterativeAuditFix(
      'http://localhost:3000/failing-component',
      'FailingComponent',
      fixCallback,
      3
    );

    expect(result.passed).toBe(false);
    expect(fixCallback).toHaveBeenCalledTimes(3); // Called 3 times for 3 iterations
  });
});
