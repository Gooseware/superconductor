import { describe, it, expect, afterEach, vi } from 'vitest';
import { HeadlessCrawlerEngine, VIEWPORT_PRESETS, captureWebPScreenshot } from '../../src/crawler/runner.js';
import { waitForHydration } from '../../src/crawler/hydration.js';

describe('HeadlessCrawlerEngine & Hydration Barrier', () => {
  let engine: HeadlessCrawlerEngine | null = null;

  afterEach(async () => {
    if (engine) {
      await engine.stop();
      engine = null;
    }
  });

  it('launches and stops with local chromium binary cleanly', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });

    await engine.start();
    expect(engine.isRunning()).toBe(true);

    const page = await engine.createPage('desktop');
    expect(page).toBeDefined();

    await engine.stop();
    expect(engine.isRunning()).toBe(false);
    expect(engine.getPoolSize()).toBe(0);
  });

  it('manages bounded context pool (2-4 contexts max)', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
      maxContexts: 3,
    });

    await engine.start();

    // Create 4 contexts in a pool capped at 3
    await engine.createContext('desktop');
    await engine.createContext('tablet');
    await engine.createContext('mobile');
    expect(engine.getPoolSize()).toBe(3);

    // Creating a 4th context should evict/close the oldest context and keep pool bounded to 3
    await engine.createContext('desktop');
    expect(engine.getPoolSize()).toBeLessThanOrEqual(3);
  });

  it('supports desktop, tablet, and mobile viewports with switching', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });

    expect(VIEWPORT_PRESETS.desktop).toEqual({ width: 1280, height: 800 });
    expect(VIEWPORT_PRESETS.tablet).toEqual({ width: 768, height: 1024 });
    expect(VIEWPORT_PRESETS.mobile).toEqual({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await engine.start();
    const page = await engine.createPage('desktop');
    expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });

    await engine.switchViewport(page, 'tablet');
    expect(page.viewportSize()).toEqual({ width: 768, height: 1024 });

    await engine.switchViewport(page, 'mobile');
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  });

  it('waits for deterministic hydration barrier on simulated HTML page with delayed mount and fonts', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });

    await engine.start();
    const page = await engine.createPage('desktop');

    // Simulated page with delayed DOM mounting and React Fiber attachment
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @font-face {
              font-family: 'DelayedFont';
              src: url('data:font/woff2;base64,d09GMgABAAAAAA') format('woff2');
            }
            body { font-family: sans-serif; }
          </style>
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>
    `;

    await page.setContent(html);

    // Initial state: not hydrated yet
    const initialContent = await page.$eval('#root', el => el.innerHTML);
    expect(initialContent).toBe('');

    // Trigger delayed React Fiber hydration
    await page.evaluate(() => {
      setTimeout(() => {
        const root = document.getElementById('root');
        if (root) {
          root.innerHTML = '<h1>Hydrated Content</h1><p>Ready for capture</p>';
          (root as any).__reactContainer$test = { stateNode: {} };
        }
      }, 150);
    });

    // Wait for hydration barrier to clear
    const startTime = Date.now();
    await waitForHydration(page, 5000);
    const elapsed = Date.now() - startTime;

    // Must have waited at least 150ms (delayed mount) + 200ms (MutationObserver quiet window)
    expect(elapsed).toBeGreaterThanOrEqual(300);

    const hydratedContent = await page.$eval('#root', el => el.innerHTML);
    expect(hydratedContent).toContain('Hydrated Content');

    const hasFiber = await page.$eval('#root', el => {
      return Object.keys(el).some(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
    });
    expect(hasFiber).toBe(true);
  });

  it('times out if hydration barrier is not satisfied', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });

    await engine.start();
    const page = await engine.createPage('desktop');

    // Page with root that never mounts
    await page.setContent(`<!DOCTYPE html><html><body><div id="root"></div></body></html>`);

    await expect(waitForHydration(page, 400)).rejects.toThrow(/hydration/i);
  });

  it('captures zero-binary CDP WebP screenshot with valid RIFF/WEBP header', async () => {
    engine = new HeadlessCrawlerEngine({
      executablePath: '/home/gooseware/.local/bin/chromium',
    });

    await engine.start();
    const page = await engine.createPage('desktop');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; margin: 0;">
          <h1 style="color: white; padding: 40px; font-family: sans-serif;">Superconductor Crawler Test</h1>
        </body>
      </html>
    `);

    const base64Data = await captureWebPScreenshot(page, 85);
    expect(base64Data).toBeDefined();
    expect(typeof base64Data).toBe('string');
    expect(base64Data.length).toBeGreaterThan(100);

    // Verify WebP RIFF header
    const buffer = Buffer.from(base64Data, 'base64');
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');

    // Test instance method as well
    const instanceData = await engine.captureWebPScreenshot(page);
    expect(instanceData).toBeDefined();
    const instanceBuffer = Buffer.from(instanceData, 'base64');
    expect(instanceBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(instanceBuffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('safely detaches CDP session in captureWebPScreenshot even if CDP send fails', async () => {
    let detached = false;
    const mockClient = {
      send: vi.fn().mockRejectedValue(new Error('CDP protocol error')),
      detach: vi.fn().mockImplementation(async () => {
        detached = true;
      }),
    };
    const mockPage = {
      context: () => ({
        newCDPSession: vi.fn().mockResolvedValue(mockClient),
      }),
    } as any;

    await expect(captureWebPScreenshot(mockPage, 80)).rejects.toThrow('CDP protocol error');
    expect(detached).toBe(true);
    expect(mockClient.detach).toHaveBeenCalled();
  });

  describe('Chromium Path Dynamic Resolution', () => {
    it('prioritizes process.env.CHROMIUM_PATH and process.env.PUPPETEER_EXECUTABLE_PATH', async () => {
      const { resolveChromiumPath } = await import('../../src/crawler/config.js');
      const origChromium = process.env.CHROMIUM_PATH;
      const origPuppeteer = process.env.PUPPETEER_EXECUTABLE_PATH;

      try {
        process.env.CHROMIUM_PATH = '/custom/bin/chromium-custom';
        expect(resolveChromiumPath()).toBe('/custom/bin/chromium-custom');

        delete process.env.CHROMIUM_PATH;
        process.env.PUPPETEER_EXECUTABLE_PATH = '/custom/bin/puppeteer-chrome';
        expect(resolveChromiumPath()).toBe('/custom/bin/puppeteer-chrome');
      } finally {
        if (origChromium) process.env.CHROMIUM_PATH = origChromium;
        else delete process.env.CHROMIUM_PATH;

        if (origPuppeteer) process.env.PUPPETEER_EXECUTABLE_PATH = origPuppeteer;
        else delete process.env.PUPPETEER_EXECUTABLE_PATH;
      }
    });
  });
});
