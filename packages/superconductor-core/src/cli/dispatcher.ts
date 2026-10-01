import {
  SuperconductorCliDispatcher,
  type Orchestrator,
  type SuperconductorCliDispatcherOptions as CliDispatcherOptions,
} from './cli-dispatcher.js';

export type { Orchestrator, CliDispatcherOptions };

export class CliDispatcher {
  private dispatcher: SuperconductorCliDispatcher;

  constructor(options: CliDispatcherOptions = {}) {
    this.dispatcher = new SuperconductorCliDispatcher(options);
  }

  public async run(args: string[] = process.argv.slice(2)): Promise<any> {
    return this.dispatcher.runOrchestrator(args);
  }

  public static async run(
    args: string[] = process.argv.slice(2),
    options: CliDispatcherOptions = {}
  ): Promise<any> {
    const dispatcher = new SuperconductorCliDispatcher(options);
    return dispatcher.runOrchestrator(args);
  }
}

export async function runCliDispatcher(
  args: string[] = process.argv.slice(2),
  options: CliDispatcherOptions = {}
): Promise<any> {
  return CliDispatcher.run(args, options);
}
