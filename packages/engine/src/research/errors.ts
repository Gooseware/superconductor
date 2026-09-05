export * from './errors/research-provider-unavailable-error.js';
export * from './errors/research-budget-exceeded-error.js';

export class FallbackFailedError extends Error {
  constructor(message: string, public readonly primaryError?: Error, public readonly fallbackError?: Error) {
    const formattedMessage = message.includes('FallbackFailedError') ? message : `FallbackFailedError: ${message}`;
    super(formattedMessage);
    this.name = 'FallbackFailedError';
  }
}
