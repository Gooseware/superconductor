export interface JevStep {
  step: number;
  action: string;
  operation: string;
  latencyMs?: number;
  text?: string;
  timestamp?: number;
  url?: string;
  status?: string;
}

export interface JevGoalResult {
  status: 'success' | 'failed' | 'timeout' | string;
  finalUrl: string;
  elapsedMs: number;
  totalActions: number;
  actionLog: string[];
  steps: JevStep[];
  observedElements: string[];
  pageText: string;
  rawOutput?: string;
}

export interface JevMcpClient {
  callTool: (toolName: string, args: Record<string, any>) => Promise<{
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
    [key: string]: any;
  }>;
}

export interface JevBrowserAdapterOptions {
  mockMode?: boolean;
  cdpPort?: number;
  mcpClient?: JevMcpClient;
  timeoutMs?: number;
}

/**
 * JevBrowserAdapter orchestrates autonomous multi-step goal execution via
 * the jev-browser MCP server (`jev_browse` tool) or simulated offline execution.
 */
export class JevBrowserAdapter {
  private mockMode: boolean;
  private cdpPort: number;
  private mcpClient?: JevMcpClient;
  private timeoutMs: number;

  constructor(options: JevBrowserAdapterOptions = {}) {
    this.mockMode = options.mockMode ?? false;
    this.cdpPort = options.cdpPort ?? 9225;
    this.mcpClient = options.mcpClient;
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  /**
   * Executes an autonomous goal on the specified URL.
   */
  async executeGoal(options: {
    url: string;
    goal: string;
    onStep?: (step: JevStep) => void;
  }): Promise<JevGoalResult> {
    const { url, goal, onStep } = options;

    // If explicit mock mode or no mcpClient is available and we are offline, run mock simulation
    if (this.mockMode || (!this.mcpClient && !process.env.TYPESAFE_API_KEY && !process.env.OPENROUTER_API_KEY)) {
      return this.executeMockGoal(url, goal, onStep);
    }

    if (this.mcpClient) {
      try {
        const response = await this.mcpClient.callTool('jev_browse', { url, goal });
        const rawText = response.content?.[0]?.text || '';
        return this.parseJevBrowseOutput(rawText, url, onStep);
      } catch (err: any) {
        if (this.mockMode) {
          return this.executeMockGoal(url, goal, onStep);
        }
        throw err;
      }
    }

    // Default fallback to mock simulation
    return this.executeMockGoal(url, goal, onStep);
  }

  /**
   * Parses the markdown summary returned by `jev_browse` MCP tool.
   */
  parseJevBrowseOutput(
    rawText: string,
    fallbackUrl: string,
    onStep?: (step: JevStep) => void
  ): JevGoalResult {
    let status = 'unknown';
    let finalUrl = fallbackUrl;
    let elapsedMs = 0;
    let totalActions = 0;
    const actionLog: string[] = [];
    const steps: JevStep[] = [];
    const observedElements: string[] = [];
    let pageText = '';

    const lines = rawText.split('\n');
    let currentSection: 'header' | 'action_log' | 'observed_elements' | 'page_text' = 'header';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('**Action Log**:')) {
        currentSection = 'action_log';
        continue;
      } else if (trimmed.startsWith('**Observed Interactive Elements**:')) {
        currentSection = 'observed_elements';
        continue;
      } else if (trimmed.startsWith('**Observed Page Text**:')) {
        currentSection = 'page_text';
        continue;
      }

      if (currentSection === 'header') {
        const statusMatch = trimmed.match(/- \*\*Status\*\*:\s*`?([^`\n]+)`?/i);
        if (statusMatch) status = statusMatch[1].trim();

        const urlMatch = trimmed.match(/- \*\*Final URL\*\*:\s*(\S+)/i);
        if (urlMatch) finalUrl = urlMatch[1].trim();

        const timeMatch = trimmed.match(/- \*\*Elapsed Time\*\*:\s*(\d+)/i);
        if (timeMatch) elapsedMs = parseInt(timeMatch[1], 10);

        const actionsMatch = trimmed.match(/- \*\*Total Actions\*\*:\s*(\d+)/i);
        if (actionsMatch) totalActions = parseInt(actionsMatch[1], 10);
      } else if (currentSection === 'action_log') {
        if (trimmed.startsWith('- Step')) {
          actionLog.push(trimmed);
          // e.g. "- Step 1: e1 (click) [latency: 120ms] -> typed: \"text\""
          const match = trimmed.match(
            /- Step (\d+):\s*([^\s(]+)\s*\(([^)]+)\)(?:\s*\[latency:\s*(\d+)ms\])?(?:\s*->\s*typed:\s*"(.*)")?/
          );
          if (match) {
            const stepNum = parseInt(match[1], 10);
            const actionId = match[2];
            const op = match[3];
            const latency = match[4] ? parseInt(match[4], 10) : undefined;
            const typedText = match[5] ?? undefined;

            const stepObj: JevStep = {
              step: stepNum,
              action: actionId,
              operation: op,
              latencyMs: latency,
              text: typedText,
              timestamp: Date.now(),
            };
            steps.push(stepObj);
            onStep?.(stepObj);
          }
        }
      } else if (currentSection === 'observed_elements') {
        if (trimmed.startsWith('- ')) {
          observedElements.push(trimmed.slice(2));
        }
      } else if (currentSection === 'page_text') {
        if (trimmed) {
          pageText += (pageText ? '\n' : '') + trimmed;
        }
      }
    }

    return {
      status,
      finalUrl,
      elapsedMs,
      totalActions: totalActions || steps.length,
      actionLog,
      steps,
      observedElements,
      pageText,
      rawOutput: rawText,
    };
  }

  /**
   * Deterministic mock execution for testing and offline scenarios.
   */
  private async executeMockGoal(
    url: string,
    goal: string,
    onStep?: (step: JevStep) => void
  ): Promise<JevGoalResult> {
    const isLogin = /log\s*in|sign\s*in|auth/i.test(goal);
    const isBilling = /bill|invoice|plan|pay/i.test(goal);

    const steps: JevStep[] = [];
    const actionLog: string[] = [];

    if (isLogin) {
      const step1: JevStep = {
        step: 1,
        action: 'e1',
        operation: 'fill',
        text: 'user@example.com',
        latencyMs: 45,
        timestamp: Date.now(),
      };
      steps.push(step1);
      actionLog.push('- Step 1: e1 (fill) [latency: 45ms] -> typed: "user@example.com"');
      onStep?.(step1);

      const step2: JevStep = {
        step: 2,
        action: 'e2',
        operation: 'fill',
        text: 'password123',
        latencyMs: 38,
        timestamp: Date.now(),
      };
      steps.push(step2);
      actionLog.push('- Step 2: e2 (fill) [latency: 38ms] -> typed: "password123"');
      onStep?.(step2);

      const step3: JevStep = {
        step: 3,
        action: 'e3',
        operation: 'click',
        latencyMs: 95,
        timestamp: Date.now(),
      };
      steps.push(step3);
      actionLog.push('- Step 3: e3 (click) [latency: 95ms]');
      onStep?.(step3);
    }

    if (isBilling) {
      const stepBilling: JevStep = {
        step: steps.length + 1,
        action: 'e' + (steps.length + 1),
        operation: 'click',
        latencyMs: 80,
        timestamp: Date.now(),
      };
      steps.push(stepBilling);
      actionLog.push(`- Step ${stepBilling.step}: ${stepBilling.action} (click) [latency: 80ms]`);
      onStep?.(stepBilling);
    }

    let finalUrl = url;
    try {
      const parsed = new URL(url);
      if (isBilling) {
        parsed.pathname = '/billing';
      } else if (isLogin) {
        parsed.pathname = '/dashboard';
      }
      finalUrl = parsed.toString();
    } catch {
      finalUrl = isBilling ? `${url}/billing` : url;
    }

    return {
      status: 'success',
      finalUrl,
      elapsedMs: 258,
      totalActions: steps.length,
      actionLog,
      steps,
      observedElements: ['[button] Submit', '[link] Billing', '[link] Settings'],
      pageText: `Simulated page content for goal: ${goal}`,
      rawOutput: actionLog.join('\n'),
    };
  }
}
