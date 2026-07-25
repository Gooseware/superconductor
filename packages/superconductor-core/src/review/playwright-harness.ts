import { chromium, Browser, Page } from 'playwright';

export interface ScreenshotOptions {
  url?: string;
  html?: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
}

export class PlaywrightHarness {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(width = 1280, height = 720): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
    if (!this.page) {
      this.page = await this.browser.newPage({
        viewport: { width, height },
      });
    }
  }

  async takeScreenshot(options: ScreenshotOptions): Promise<string> {
    await this.init(options.width, options.height);

    if (!this.page) {
      throw new Error('Playwright page failed to initialize');
    }

    if (options.url) {
      await this.page.goto(options.url, { waitUntil: 'load' });
    } else if (options.html) {
      await this.page.setContent(options.html, { waitUntil: 'load' });
    } else {
      throw new Error('Must provide either url or html to takeScreenshot');
    }

    const screenshotBuffer = await this.page.screenshot({
      fullPage: options.fullPage ?? false,
      type: 'png'
    });

    return screenshotBuffer.toString('base64');
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
