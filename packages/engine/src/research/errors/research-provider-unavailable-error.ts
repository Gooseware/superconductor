export class ResearchProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchProviderUnavailableError';
  }
}
