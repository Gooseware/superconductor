export class FallbackFailedError extends Error {
  constructor(message: string = 'Fallback search failed') {
    super(message);
    this.name = 'FallbackFailedError';
  }
}
