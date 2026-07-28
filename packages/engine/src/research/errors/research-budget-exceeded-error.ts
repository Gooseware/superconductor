export class ResearchBudgetExceededError extends Error {
  constructor(message: string = 'Research budget exceeded') {
    super(message);
    this.name = 'ResearchBudgetExceededError';
  }
}
