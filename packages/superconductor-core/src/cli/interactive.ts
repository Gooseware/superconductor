export class InteractiveOrchestrator {
  static async run(args: string[]): Promise<any> {
    return { mode: 'interactive', args };
  }
}
