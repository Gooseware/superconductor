export * from './errors/research-provider-unavailable-error.js';
export * from './errors/research-budget-exceeded-error.js';

export class FallbackFailedError extends Error {
  constructor(message: string = 'Both primary and fallback providers failed.') {
    const fullMessage = message.startsWith('FallbackFailedError') ? message : `FallbackFailedError: ${message}`;
    super(fullMessage);
    this.name = 'FallbackFailedError';
  }
}