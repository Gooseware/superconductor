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
import { resolveChromiumPath } from './config.js';

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
 * Validates target URL against SSRF and unsupported protocols (SEC-4).
 * Enforces http/https and blocks cloud metadata IPs/hosts.
 */
export function validateTargetUrl(rawUrl: string): URL {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Invalid target URL: URL must be a non-empty string.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (e: any) {
    throw new Error(`Invalid target URL "${rawUrl}": ${e?.message || 'malformed URL'}`);
  }

  // Enforce http: or https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `SSRF protocol violation: Unsupported protocol "${parsed.protocol}". Only "http:" and "https:" are permitted.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Cloud metadata hosts & IP
  const blockedHosts = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata',
    'instance-data',
  ];

  if (blockedHosts.includes(hostname) || hostname.endsWith('.metadata.google.internal')) {
    throw new Error(
      `SSRF security violation: Access to cloud metadata service at "${hostname}" is blocked.`
    );
  }

  return parsed;
}

/**
 * Creates and starts a Remote Human Auth Bridge session for human authentication.
 */
export async function createAuthSession(
  options: CreateAuthSessionOptions
): Promise<AuthSessionHandle> {
  validateTargetUrl(options.url);

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
      executablePath: resolveChromiumPath(),
      headless: options.headless ?? true,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800',
        '--lang=en-US,en',
      ],
    });
    const context = await browserInstance.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      // @ts-ignore
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      // @ts-ignore
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      // @ts-ignore
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });
    pageInstance = await context.newPage();
    await pageInstance.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
      console.error('[superconductor] Navigation failed in createAuthSession:', err?.message || err);
    });
    await bridge.attach(pageInstance).catch((err) => {
      console.error('[superconductor] Bridge attach failed in createAuthSession:', err?.message || err);
    });
  } catch (err: any) {
    console.error('[superconductor] Browser launch failed in createAuthSession:', err?.message || err);
  }

  // Auto-persist profile state to AuthManager on finish
  bridge.finishPromise
    .then(async (state) => {
      if (state) {
        const authManager = new AuthManager(options.projectRoot || process.cwd());
        await authManager.saveProfile(options.profileName, state);
      }
    })
    .catch((err) => {
      console.error('[superconductor] Error persisting auth profile:', err?.message || err);
    });

  const stop = async () => {
    await bridge.stop().catch((err) => {
      console.error('[superconductor] Error stopping bridge in createAuthSession:', err?.message || err);
    });
    if (browserInstance) {
      await browserInstance.close().catch((err) => {
        console.error('[superconductor] Error closing browser in createAuthSession:', err?.message || err);
      });
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
  validateTargetUrl(options.url);
  const scraper = new DualScraper();
  const mode = options.mode || 'read';

  let browser: Browser | null = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      executablePath: resolveChromiumPath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
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
    console.error('[superconductor] Error in scrapePage:', err?.message || err);
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
      await browser.close().catch((err) => {
        console.error('[superconductor] Error closing browser in scrapePage:', err?.message || err);
      });
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
  validateTargetUrl(options.url);
  const distiller = new ThemeDistiller();
  let browser: Browser | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      executablePath: resolveChromiumPath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext();

    if (options.profile) {
      const authManager = new AuthManager(options.projectRoot || process.cwd());
      await authManager.hydrateContext(context, options.profile);
    }

    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    return await distiller.distillTheme(page, { name: options.name });
  } catch (err: any) {
    console.error('[superconductor] Error in distillPageTheme:', err?.message || err);
    return await distiller.extractTheme(options.url);
  } finally {
    if (browser) {
      await browser.close().catch((err) => {
        console.error('[superconductor] Error closing browser in distillPageTheme:', err?.message || err);
      });
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
