export interface LongPollerOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export class AsyncLongPoller<T> {
  private pollIntervalMs: number;
  private maxWaitMs: number;
  
  constructor(options: LongPollerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.maxWaitMs = options.maxWaitMs || 30000;
  }
  
  async poll(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let attempts = 0;
    
    while (true) {
      if (Date.now() - startTime >= this.maxWaitMs) {
        throw new Error('Timeout exceeded');
      }
      
      try {
        return await fn();
      } catch (err: any) {
        if (err?.status === 429 && err?.headers) {
          const retryAfter = err.headers['retry-after'] || err.headers['Retry-After'];
          if (retryAfter) {
            const delay = parseInt(retryAfter, 10);
            if (!isNaN(delay)) {
              await this.sleep(delay * 1000);
              attempts++;
              continue;
            }
          }
        }
        
        // exponential backoff with jitter
        const backoff = this.pollIntervalMs * Math.pow(2, attempts) + Math.random() * 100;
        await this.sleep(backoff);
        attempts++;
      }
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
