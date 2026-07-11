import { chromium, Browser, Page } from 'playwright';
import { DesignSchema, AuditResult, AuditEvent } from './vlm-auditor.types.js';

export interface VlmClient {
  invokeVlm(prompt: string, image: Buffer): Promise<AuditResult>;
}

export class VlmAuditor {
  private schema: DesignSchema;
  private vlmClient: VlmClient;

  constructor(schema: DesignSchema, vlmClient: VlmClient) {
    this.schema = schema;
    this.vlmClient = vlmClient;
  }

  async captureScreenshot(url: string, selector?: string): Promise<Buffer> {
    let browser: Browser | null = null;
    let page: Page | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });

      if (selector) {
        const locator = page.locator(selector);
        return Buffer.from(await locator.screenshot());
      } else {
        return Buffer.from(await page.screenshot({ fullPage: true }));
      }
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async auditComponent(url: string, componentName: string, selector?: string): Promise<AuditResult> {
    const screenshot = await this.captureScreenshot(url, selector);
    
    const prompt = `
      Please audit the provided screenshot against the following Design Schema.
      
      Design Schema:
      ${JSON.stringify(this.schema, null, 2)}
      
      Requirements:
      1. Verify all colors match the schema.
      2. Verify spacing rhythms.
      3. Verify typography scales.
      
      Respond with a JSON object matching the AuditResult interface.
    `;

    const result = await this.vlmClient.invokeVlm(prompt, screenshot);
    return result;
  }

  async iterativeAuditFix(
    url: string,
    componentName: string,
    applyFixCallback: (suggestions: string[]) => Promise<void>,
    maxIterations: number = 3,
    selector?: string
  ): Promise<AuditResult> {
    let iteration = 0;
    let lastResult: AuditResult | null = null;

    while (iteration < maxIterations) {
      lastResult = await this.auditComponent(url, componentName, selector);
      
      if (lastResult.passed) {
        return lastResult;
      }

      if (lastResult.suggestions && lastResult.suggestions.length > 0) {
        await applyFixCallback(lastResult.suggestions);
      }
      
      iteration++;
    }

    return lastResult!;
  }
}
