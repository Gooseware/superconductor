import { ResearchProviderUnavailableError } from './errors/research-provider-unavailable-error.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  cooldownMs?: number;
  clock?: () => number;
}

export class CircuitBreakerOpenError extends ResearchProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  public readonly name: string;
  public readonly failureThreshold: number;
  public readonly cooldownMs: number;
  private readonly clock: () => number;

  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures: number = 0;
  private lastFailureTime: number = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 2;
    this.cooldownMs = options.cooldownMs ?? 60000;
    this.clock = options.clock ?? (() => Date.now());
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const elapsed = this.clock() - this.lastFailureTime;
      if (elapsed >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
  }

  public recordFailure(): void {
    this.lastFailureTime = this.clock();
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.consecutiveFailures = this.failureThreshold;
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.state = 'OPEN';
      }
    }
  }

  public isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  public async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      if (fallback) {
        return await fallback();
      }
      throw new CircuitBreakerOpenError(`Circuit breaker '${this.name}' is OPEN`);
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      if (fallback) {
        return await fallback();
      }
      throw error;
    }
  }
}
