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
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async poll<R = T>(
    operation: () => Promise<{ status: 'done' | 'pending'; result?: R; retryAfter?: number }>,
    startTime?: number,
    errorAttempt?: number
  ): Promise<R>;
  async poll<R = T>(
    fn: () => Promise<R>,
    startTime?: number,
    errorAttempt?: number
  ): Promise<R>;
  async poll<R = T>(
    operation: any,
    startTime: number = Date.now(),
    errorAttempt: number = 0
  ): Promise<R> {
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
      
      await this.sleep(delay);
      return this.poll(operation, startTime, errorAttempt + 1);
    }

    if (response && typeof response === 'object' && response.status === 'done') {
      return response.result as R;
    }

    if (response && typeof response === 'object' && response.status === 'pending') {
      let baseDelay = (response.retryAfter !== undefined) ? response.retryAfter * 1000 : this.pollIntervalMs;
      if (isNaN(baseDelay)) {
        baseDelay = this.pollIntervalMs;
      }
      const jitter = Math.random() * 0.2 * baseDelay; // 20% jitter
      delay = baseDelay + jitter;

      const timeElapsed = Date.now() - startTime;
      if (timeElapsed + delay > this.maxWaitMs) {
        throw new Error('Timeout exceeded');
      }

      await this.sleep(delay);
      return this.poll(operation, startTime, errorAttempt); // do not increment errorAttempt for normal pending states
    }

    return response as R;
  }
}
