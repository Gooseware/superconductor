export enum ExecutionMode {
  INTERACTIVE = 'INTERACTIVE',
  HEADLESS = 'HEADLESS',
  BATCH_OVERNIGHT = 'BATCH_OVERNIGHT',
}

export class NonInteractiveModeError extends Error {
  readonly mode: ExecutionMode;
  constructor(mode: ExecutionMode, context?: string) {
    super(`Interactive input unavailable in ${mode} mode${context ? ': ' + context : ''}`);
    this.name = 'NonInteractiveModeError';
    this.mode = mode;
    Object.setPrototypeOf(this, NonInteractiveModeError.prototype);
  }
}
