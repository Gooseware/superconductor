import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { waitForHydration } from './hydration.js';
import { resolveChromiumPath } from './config.js';

export type ViewportDevice = 'desktop' | 'tablet' | 'mobile';

export interface ViewportConfig {
  width: number;
  height: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

export const VIEWPORT_PRESETS: Record<ViewportDevice, ViewportConfig> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
};

export interface HeadlessCrawlerEngineOptions {
  executablePath?: string;
  maxContexts?: number;
  headless?: boolean;
  args?: string[];
  recordVideo?: {
    dir: string;
    size?: { width: number; height: number };
  };
}

/**
 * Capture a full-page zero-binary CDP WebP screenshot using Chrome DevTools Protocol.
 */
export async function captureWebPScreenshot(page: Page, quality = 80): Promise<string> {
  const client = await page.context().newCDPSession(page);
  try {
    const result = await client.send('Page.captureScreenshot', {
      format: 'webp',
      quality,
      captureBeyondViewport: true,
    });
    return result.data;
  } finally {
    await client.detach().catch(() => {});
  }
}

export class HeadlessCrawlerEngine {
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private readonly executablePath: string;
  private readonly maxContexts: number;
  private readonly headless: boolean;
  private readonly args: string[];
  private readonly recordVideo?: { dir: string; size?: { width: number; height: number } };

  constructor(options: HeadlessCrawlerEngineOptions = {}) {
    this.executablePath = options.executablePath || resolveChromiumPath();
    // Pool bounded to 2-4 contexts max
    const requestedMax = options.maxContexts ?? 4;
    this.maxContexts = Math.min(Math.max(requestedMax, 2), 4);
    this.headless = options.headless ?? true;
    this.args = options.args ?? ['--no-sandbox', '--disable-setuid-sandbox'];
    this.recordVideo = options.recordVideo;
  }

  /**
   * Launch the Chromium browser instance.
   */
  async start(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      return;
    }

    this.browser = await chromium.launch({
      executablePath: this.executablePath,
      headless: this.headless,
      args: this.args,
    });
  }

  /**
   * Check if browser is currently launched and running.
   */
  isRunning(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Current number of contexts held in pool.
   */
  getPoolSize(): number {
    return this.contexts.length;
  }

  /**
   * Create a new context in the bounded context pool.
   * Evicts the oldest context if pool capacity (2-4 max) is exceeded.
   */
  async createContext(
    device: ViewportDevice = 'desktop',
    contextOptions?: Record<string, any>
  ): Promise<BrowserContext> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.start();
    }

    // Evict oldest contexts to maintain bounded pool
    while (this.contexts.length >= this.maxContexts) {
      const oldest = this.contexts.shift();
      if (oldest) {
        try {
          await oldest.close();
        } catch {
          // ignore already closed
        }
      }
    }

    const preset = VIEWPORT_PRESETS[device] || VIEWPORT_PRESETS.desktop;
    const context = await this.browser!.newContext({
      viewport: { width: preset.width, height: preset.height },
      isMobile: preset.isMobile ?? false,
      hasTouch: preset.hasTouch ?? false,
      ...(this.recordVideo ? { recordVideo: this.recordVideo } : {}),
      ...contextOptions,
    });

    this.contexts.push(context);

    context.on('close', () => {
      const idx = this.contexts.indexOf(context);
      if (idx !== -1) {
        this.contexts.splice(idx, 1);
      }
    });

    return context;
  }

  /**
   * Create a new page with the configured device viewport.
   */
  async createPage(
    device: ViewportDevice = 'desktop',
    contextOptions?: Record<string, any>
  ): Promise<Page> {
    const context = await this.createContext(device, contextOptions);
    return context.newPage();
  }

  /**
   * Switch the viewport dimensions of an existing page.
   */
  async switchViewport(page: Page, device: ViewportDevice): Promise<void> {
    const preset = VIEWPORT_PRESETS[device];
    if (!preset) {
      throw new Error(`Unknown viewport preset: ${device}`);
    }
    await page.setViewportSize({ width: preset.width, height: preset.height });
  }

  /**
   * Capture a zero-binary CDP WebP screenshot for the given page.
   */
  async captureWebPScreenshot(page: Page, quality = 80): Promise<string> {
    return captureWebPScreenshot(page, quality);
  }

  /**
   * Wait for deterministic hydration barrier on the given page.
   */
  async waitForHydration(page: Page, timeoutMs = 10000): Promise<void> {
    return waitForHydration(page, timeoutMs);
  }

  /**
   * Teardown engine: close all contexts and the browser instance.
   */
  async stop(): Promise<void> {
    const contextsToClose = [...this.contexts];
    this.contexts = [];

    for (const ctx of contextsToClose) {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }
}
