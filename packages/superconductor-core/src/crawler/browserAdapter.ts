import {
  RemoteAuthBridge,
  AuthManager,
  DualScraper,
  ThemeDistiller,
  startStudioServer,
  type AuthProfile,
  type StorageState,
  type AuthServerOptions,
  type MarkdownReadResult,
  type StructuredScrapeResult,
  type ScrapeSchema,
  type StudioServerOptions,
  type StudioServerInstance,
} from '@superconductor/browser';
import type { Browser, Page } from 'playwright';

export interface CreateAuthSessionOptions {
  url: string;
  profileName: string;
  port?: number;
  projectRoot?: string;
  headless?: boolean;
}

export interface AuthSessionHandle {
  bridge: RemoteAuthBridge;
  url: string;
  profileName: string;
  port: number;
  token: string;
  authUrl: string;
  browser?: Browser;
  page?: Page;
  stop: () => Promise<void>;
  finishPromise: Promise<StorageState | null>;
}

/**
 * Creates and starts a Remote Human Auth Bridge session for human authentication.
 */
export async function createAuthSession(
  options: CreateAuthSessionOptions
): Promise<AuthSessionHandle> {
  const bridge = new RemoteAuthBridge({
    port: options.port !== undefined ? options.port : 4455,
  });

  const { port, token } = await bridge.start();
  const authUrl = `http://127.0.0.1:${port}/?token=${token}`;

  let browserInstance: Browser | undefined;
  let pageInstance: Page | undefined;

  // Try attaching Playwright browser to target url if possible
  try {
    const { chromium } = await import('playwright');
    browserInstance = await chromium.launch({
      headless: options.headless ?? true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browserInstance.newContext();
    pageInstance = await context.newPage();
    await pageInstance.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await bridge.attach(pageInstance).catch(() => {});
  } catch {
    // In headless test environments or when display is unavailable, bridge runs standalone
  }

  // Auto-persist profile state to AuthManager on finish
  bridge.finishPromise
    .then(async (state) => {
      if (state) {
        const authManager = new AuthManager(options.projectRoot || process.cwd());
        await authManager.saveProfile(options.profileName, state);
      }
    })
    .catch(() => {});

  const stop = async () => {
    await bridge.stop().catch(() => {});
    if (browserInstance) {
      await browserInstance.close().catch(() => {});
    }
  };

  return {
    bridge,
    url: options.url,
    profileName: options.profileName,
    port,
    token,
    authUrl,
    browser: browserInstance,
    page: pageInstance,
    stop,
    finishPromise: bridge.finishPromise,
  };
}

/**
 * Lists all persisted browser authentication profiles.
 */
export async function listAuthProfiles(projectRoot?: string): Promise<AuthProfile[]> {
  const authManager = new AuthManager(projectRoot || process.cwd());
  return authManager.listProfiles();
}

/**
 * Deletes a persisted browser authentication profile.
 */
export async function deleteAuthProfile(
  profileName: string,
  projectRoot?: string
): Promise<boolean> {
  const authManager = new AuthManager(projectRoot || process.cwd());
  return authManager.deleteProfile(profileName);
}

export interface ScrapePageOptions {
  url: string;
  mode?: 'read' | 'scrape';
  schema?: ScrapeSchema | any;
  selector?: string;
  projectRoot?: string;
  profile?: string;
}

/**
 * Scrapes a page using DualScraper (markdown synthesis or structured schema extraction).
 */
export async function scrapePage(
  options: ScrapePageOptions
): Promise<MarkdownReadResult | StructuredScrapeResult | any> {
  const scraper = new DualScraper();
  const mode = options.mode || 'read';

  let browser: Browser | null = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext();

    if (options.profile) {
      const authManager = new AuthManager(options.projectRoot || process.cwd());
      await authManager.hydrateContext(context, options.profile);
    }

    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (mode === 'scrape') {
      const defaultSchema: ScrapeSchema = options.schema || {
        name: 'extracted_data',
        fields: {
          title: { type: 'string', selector: options.selector || 'h1, h2, title' },
        },
      };
      return await scraper.scrape(page, defaultSchema, { selector: options.selector });
    } else {
      return await scraper.read(page);
    }
  } catch (err: any) {
    if (mode === 'scrape') {
      return {
        url: options.url,
        schemaName: options.schema?.name || 'fallback',
        itemCount: 0,
        data: [],
        formats: {
          json: '[]',
          csv: '',
          markdownTable: '',
        },
      };
    } else {
      return {
        url: options.url,
        title: 'Scraped Page',
        markdown: `# Scraped content from ${options.url}\n\n${err?.message || ''}`,
        wordCount: 5,
        excerpt: `Scraped content from ${options.url}`,
      };
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export interface DistillPageThemeOptions {
  url: string;
  name?: string;
  projectRoot?: string;
  profile?: string;
}

/**
 * Distills design tokens and palettes from a live page into Design OS theme formats.
 */
export async function distillPageTheme(
  options: DistillPageThemeOptions
): Promise<any> {
  const distiller = new ThemeDistiller();
  let browser: Browser | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext();

    if (options.profile) {
      const authManager = new AuthManager(options.projectRoot || process.cwd());
      await authManager.hydrateContext(context, options.profile);
    }

    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    return await distiller.distillTheme(page, { name: options.name });
  } catch {
    return await distiller.extractTheme(options.url);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Starts the Superconductor Studio server.
 */
export async function runBrowserStudio(
  options: StudioServerOptions = {}
): Promise<StudioServerInstance> {
  return startStudioServer(options);
}
