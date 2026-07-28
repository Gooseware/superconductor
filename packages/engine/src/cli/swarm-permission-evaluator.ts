import * as fs from "fs";

export class SwarmPermissionViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwarmPermissionViolationError";
  }
}

export class SwarmPermissionEvaluator {
  private swarmActive: boolean = false;

  constructor(agentConfigPath: string) {
    if (fs.existsSync(agentConfigPath)) {
      const configContent = fs.readFileSync(agentConfigPath, "utf8");
      if (/Swarm Mode:\s*active/i.test(configContent)) {
        this.swarmActive = true;
      }
    }
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
        throw new SwarmPermissionViolationError(
          "Root model tool execution revoked: Swarm Mode is active."
        );
      }
    }
  }
}
