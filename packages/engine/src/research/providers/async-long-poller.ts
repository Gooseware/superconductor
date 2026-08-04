export interface LongPollerOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export class AsyncLongPoller<T = any> {
  private pollIntervalMs: number;
  private maxWaitMs: number;

  constructor(options: LongPollerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.maxWaitMs = options.maxWaitMs ?? 30000;
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

  async poll<T>(
    operation: () => Promise<{ status: 'done' | 'pending'; result?: T; retryAfter?: number }>,
    startTime: number = Date.now(),
    errorAttempt: number = 0
  ): Promise<T> {
    if (Date.now() - startTime > this.maxWaitMs) {
      throw new Error('Timeout exceeded');
    }

    let delay: number = 0;
    let response;
    try {
      response = await operation();
    } catch (e: any) {
      console.warn(e);
      let is429 = false;
      if (e && e.status === 429) {
        is429 = true;
        const retryAfter = e.headers ? (typeof e.headers.get === 'function' ? e.headers.get('Retry-After') : e.headers['Retry-After']) : null;
        if (retryAfter) {
          let parsedDelay = parseInt(retryAfter, 10) * 1000;
          if (isNaN(parsedDelay)) {
            const parsedDate = new Date(retryAfter).getTime();
            if (!isNaN(parsedDate)) {
              delay = Math.max(0, parsedDate - Date.now());
            } else {
              delay = this.pollIntervalMs * Math.pow(2, errorAttempt);
            }
          } else {
            delay = parsedDelay;
          }
        } else {
          delay = this.pollIntervalMs * Math.pow(2, errorAttempt);
        }
      } else {
        const isTransient = e && (
          e.status >= 500 ||
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT' ||
          e.code === 'ECONNREFUSED' ||
          e.code === 'ENOTFOUND' ||
          (e.name === 'TypeError' && e.message === 'fetch failed')
        );
        if (isTransient) {
          delay = this.pollIntervalMs * Math.pow(2, errorAttempt);
        } else {
          throw e;
        }
      }
      
      const jitter = Math.random() * 0.2 * delay;
      delay += jitter;
      
      const timeElapsed = Date.now() - startTime;
      if (timeElapsed + delay > this.maxWaitMs) {
        throw new Error('Timeout exceeded', { cause: e });
      }
      
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.poll(operation, startTime, errorAttempt + 1);
    }

    if (response && response.status === 'done') {
      return response.result as T;
    }

    let baseDelay = (response && response.retryAfter !== undefined) ? response.retryAfter * 1000 : this.pollIntervalMs;
    if (isNaN(baseDelay)) {
      baseDelay = this.pollIntervalMs;
    }
    const jitter = Math.random() * 0.2 * baseDelay; // 20% jitter
    delay = baseDelay + jitter;
    
    const timeElapsed = Date.now() - startTime;
    if (timeElapsed + delay > this.maxWaitMs) {
      throw new Error('Timeout exceeded');
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    return this.poll(operation, startTime, errorAttempt); // do not increment errorAttempt for normal pending states
  }
}
