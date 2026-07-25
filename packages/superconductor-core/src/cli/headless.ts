export class HeadlessOrchestrator {
  static async run(args: string[]): Promise<any> {
    return { mode: 'headless', args };
  }
}
