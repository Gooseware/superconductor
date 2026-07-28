import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from "fs";
import path from "path";
import { SwarmPermissionEvaluator, SwarmPermissionViolationError } from "../../src/cli/swarm-permission-evaluator";

describe("SwarmPermissionEvaluator", () => {
  const tempDir = path.join(__dirname, "temp-test");
  const activeConfig = path.join(tempDir, "agent-config-active.md");
  const inactiveConfig = path.join(tempDir, "agent-config-inactive.md");
  const missingConfig = path.join(tempDir, "agent-config-missing.md");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
    fs.writeFileSync(activeConfig, "Swarm Mode: active");
    fs.writeFileSync(inactiveConfig, "Swarm Mode: inactive");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.SUPERCONDUCTOR_ROLE;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SUPERCONDUCTOR_ROLE;
    } else {
      process.env.SUPERCONDUCTOR_ROLE = originalEnv;
    }
  });

  it("isSwarmModeActive() returns true when config contains Swarm Mode: active", () => {
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    expect(evaluator.isSwarmModeActive()).toBe(true);
  });

  it("isSwarmModeActive() returns false when config contains Swarm Mode: inactive or missing", () => {
    const evalInactive = new SwarmPermissionEvaluator(inactiveConfig);
    expect(evalInactive.isSwarmModeActive()).toBe(false);

    const evalMissing = new SwarmPermissionEvaluator(missingConfig);
    expect(evalMissing.isSwarmModeActive()).toBe(false);
  });

  it("getRevokedTools() returns the 3 tools when active, [] when inactive", () => {
    const evalActive = new SwarmPermissionEvaluator(activeConfig);
    expect(evalActive.getRevokedTools()).toEqual(["write_file", "run_command", "multi_replace_file_content"]);

    const evalInactive = new SwarmPermissionEvaluator(inactiveConfig);
    expect(evalInactive.getRevokedTools()).toEqual([]);
  });

  it("assertRootModelRestricted() throws SwarmPermissionViolationError when swarm active + root", () => {
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    process.env.SUPERCONDUCTOR_ROLE = "root";
    expect(() => evaluator.assertRootModelRestricted()).toThrow(SwarmPermissionViolationError);

    delete process.env.SUPERCONDUCTOR_ROLE;
    expect(() => evaluator.assertRootModelRestricted()).toThrow(SwarmPermissionViolationError);
  });

  it("assertRootModelRestricted() does NOT throw when swarm active + processor", () => {
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    process.env.SUPERCONDUCTOR_ROLE = "processor";
    expect(() => evaluator.assertRootModelRestricted()).not.toThrow();
  });

  it("assertRootModelRestricted() does NOT throw when swarm inactive", () => {
    const evaluator = new SwarmPermissionEvaluator(inactiveConfig);
    process.env.SUPERCONDUCTOR_ROLE = "root";
    expect(() => evaluator.assertRootModelRestricted()).not.toThrow();
  });
});
