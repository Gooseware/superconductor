import * as fs from "fs";
import { ExecutionMode } from "../guard/execution-mode.js";
import { RogueWriteGuard } from "../guard/rogue-write-guard.js";

export class SwarmPermissionViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwarmPermissionViolationError";
  }
}

export interface SwarmPermissionEvaluatorOptions {
  headless?: boolean;
}

export class SwarmPermissionEvaluator {
  private swarmActive: boolean = false;
  private headless: boolean;
  private rogueWriteGuard: RogueWriteGuard | null = null;

  constructor(agentConfigPath: string, options: SwarmPermissionEvaluatorOptions = {}) {
    if (fs.existsSync(agentConfigPath)) {
      const configContent = fs.readFileSync(agentConfigPath, "utf8");
      if (/Swarm Mode:\s*active/i.test(configContent)) {
        this.swarmActive = true;
      }
    }
    this.headless = options.headless ?? false;
  }

  isSwarmModeActive(): boolean {
    return this.swarmActive;
  }

  getRevokedTools(): string[] {
    if (this.swarmActive) {
      return ["write_file", "run_command", "multi_replace_file_content"];
    }
    return [];
  }

  assertRootModelRestricted(): void {
    if (this.swarmActive) {
      const role = process.env.SUPERCONDUCTOR_ROLE;
      if (!role || role === "root") {
        this.rogueWriteGuard = new RogueWriteGuard(role || "root");
        console.warn(
          "[Superconductor] Root model cannot execute tracks directly. Please use invoke_subagent or explicitly delegate."
        );
      }
    }
  }

  getRogueWriteGuard(): RogueWriteGuard | null {
    return this.rogueWriteGuard;
  }

  /**
   * Asserts that a root-role agent write to the given path is allowed.
   * Only active when SUPERCONDUCTOR_ROLE=root AND swarm mode is active.
   * @param filePath - The path the agent is attempting to write to
   * @throws RogueWriteAttemptError if the write would violate root-role constraints
   */
  assertRootWriteAllowed(filePath: string): void {
    if (!this.swarmActive) return;
    const role = process.env.SUPERCONDUCTOR_ROLE;
    if (role !== 'root') return;
    if (!this.rogueWriteGuard) {
      this.rogueWriteGuard = new RogueWriteGuard('root');
    }
    this.rogueWriteGuard.assertWriteAllowed(filePath);
  }

  /**
   * Returns the current execution mode.
   * - Returns HEADLESS if process.env.CI is set to a truthy value (excludes 'false', '0', 'no', 'off', '').
   * - Returns HEADLESS if the evaluator was constructed with { headless: true }.
   * - Returns INTERACTIVE otherwise.
   */
  getExecutionMode(): ExecutionMode {
    const CI_FALSY_VALUES = new Set(['false', '0', 'no', 'off', '']);
    const ci = process.env.CI;
    if ((ci !== undefined && !CI_FALSY_VALUES.has(ci.toLowerCase())) || this.headless) {
      return ExecutionMode.HEADLESS;
    }
    return ExecutionMode.INTERACTIVE;
  }
}
