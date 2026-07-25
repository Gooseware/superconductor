export interface Orchestrator {
  run(args: string[]): Promise<any>;
}

export interface CliDispatcherOptions {
  isTTY?: boolean;
  interactiveOrchestrator?: Orchestrator;
  headlessOrchestrator?: Orchestrator;
}

export class CliDispatcher {
  private isTTY: boolean;
  private interactiveOrchestrator?: Orchestrator;
  private headlessOrchestrator?: Orchestrator;

  constructor(options: CliDispatcherOptions = {}) {
    this.isTTY = options.isTTY ?? Boolean(process.stdout && process.stdout.isTTY);
    this.interactiveOrchestrator = options.interactiveOrchestrator;
    this.headlessOrchestrator = options.headlessOrchestrator;
  }

  public async run(args: string[] = process.argv.slice(2)): Promise<any> {
    const isExplicitHeadless = args.includes('--headless');
    const isExplicitInteractive = args.includes('--interactive');

    let useHeadless: boolean;
    if (isExplicitHeadless) {
      useHeadless = true;
    } else if (isExplicitInteractive) {
      useHeadless = false;
    } else {
      useHeadless = !this.isTTY;
    }

    if (useHeadless) {
      const orchestrator = this.headlessOrchestrator ?? (await import('./headless.js')).HeadlessOrchestrator;
      return await orchestrator.run(args);
    } else {
      const orchestrator = this.interactiveOrchestrator ?? (await import('./interactive.js')).InteractiveOrchestrator;
      return await orchestrator.run(args);
    }
  }

  public static async run(args: string[] = process.argv.slice(2), options: CliDispatcherOptions = {}): Promise<any> {
    const dispatcher = new CliDispatcher(options);
    return dispatcher.run(args);
  }
}

export async function runCliDispatcher(args: string[] = process.argv.slice(2), options: CliDispatcherOptions = {}): Promise<any> {
  return CliDispatcher.run(args, options);
}
