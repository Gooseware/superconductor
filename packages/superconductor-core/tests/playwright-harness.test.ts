import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaywrightHarness } from '../src/review/playwright-harness';
import { chromium } from 'playwright';

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  }
}));

describe('PlaywrightHarness', () => {
  let harness: PlaywrightHarness;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      setContent: vi.fn().mockResolvedValue(null),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot-data')),
      close: vi.fn().mockResolvedValue(null),
      setViewportSize: vi.fn().mockResolvedValue(null),
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(null),
    };

    (chromium.launch as any).mockResolvedValue(mockBrowser);

    harness = new PlaywrightHarness();
  });

  it('should initialize browser and page only once', async () => {
    await harness.init();
    await harness.init();

    expect(chromium.launch).toHaveBeenCalledTimes(1);
    expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
    expect(mockBrowser.newPage).toHaveBeenCalledWith({ viewport: { width: 1280, height: 720 } });
  });

  it('should take screenshot from URL', async () => {
    const base64 = await harness.takeScreenshot({ url: 'http://example.com' });
    
    expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', { waitUntil: 'load' });
    expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: false, type: 'png' });
    expect(base64).toBe(Buffer.from('fake-screenshot-data').toString('base64'));
  });

  it('should take screenshot from HTML content', async () => {
    const base64 = await harness.takeScreenshot({ html: '<h1>Hello</h1>' });
    
    expect(mockPage.setContent).toHaveBeenCalledWith('<h1>Hello</h1>', { waitUntil: 'load' });
    expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: false, type: 'png' });
    expect(base64).toBe(Buffer.from('fake-screenshot-data').toString('base64'));
  });

  it('should pass options like fullPage, width, height', async () => {
    await harness.takeScreenshot({ url: 'http://example.com', width: 800, height: 600, fullPage: true });

    expect(mockBrowser.newPage).toHaveBeenCalledWith({ viewport: { width: 800, height: 600 } });
    expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true, type: 'png' });
  });

  it('should throw error if neither url nor html is provided', async () => {
    await expect(harness.takeScreenshot({})).rejects.toThrow('Must provide either url or html to takeScreenshot');
  });

  it('should throw error if page fails to initialize', async () => {
    (chromium.launch as any).mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(null) // return null page
    });
    
    await expect(harness.takeScreenshot({ url: 'http://example.com' })).rejects.toThrow('Playwright page failed to initialize');
  });

  it('should close page and browser', async () => {
    await harness.init();
    await harness.close();
    
    expect(mockPage.close).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);

    // Call close again to ensure it's safe if already closed
    await harness.close();
    expect(mockPage.close).toHaveBeenCalledTimes(1);
  });
});
