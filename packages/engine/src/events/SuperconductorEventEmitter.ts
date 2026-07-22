import type { AgentTurnEvent } from '../types/shared-schema.js';

export interface EventEmitterOptions {
  caduceusApiUrl?: string;
  timeoutMs?: number;
}

export class SuperconductorEventEmitter {
  private caduceusApiUrl: string;
  private timeoutMs: number;

  constructor(options: EventEmitterOptions = {}) {
    this.caduceusApiUrl = options.caduceusApiUrl || 'http://localhost:1691';
    this.timeoutMs = options.timeoutMs || 500;
  }

  /**
   * Fire-and-forget event emission to Caduceus MCP server.
   * Never throws or blocks main thread.
   */
  public async emit(event: AgentTurnEvent): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.caduceusApiUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: controller.signal
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      // Silent fail to preserve engine resilience
      return false;
    }
  }
}
