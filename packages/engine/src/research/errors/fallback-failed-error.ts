export class FallbackFailedError extends Error {
  constructor(
    message: string = 'Fallback search failed',
    public readonly primaryError?: Error,
    public readonly fallbackError?: Error
  ) {
    super(message);
    this.name = 'FallbackFailedError';
  }
}

