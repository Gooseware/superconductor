import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from "fs";
import path from "path";
import { SwarmPermissionEvaluator, SwarmPermissionViolationError } from "../../src/cli/swarm-permission-evaluator";
import { ExecutionMode } from "../../src/guard/execution-mode.js";
import { RogueWriteAttemptError, RogueWriteGuard } from "../../src/guard/rogue-write-guard.js";

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

  it("assertRootModelRestricted() logs warning when swarm active + root and registers RogueWriteGuard", () => {
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    process.env.SUPERCONDUCTOR_ROLE = "root";
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    evaluator.assertRootModelRestricted();
    expect(warnSpy).toHaveBeenCalledWith("[Superconductor] Root model cannot execute tracks directly. Please use invoke_subagent or explicitly delegate.");
    expect(evaluator.getRogueWriteGuard()).toBeInstanceOf(RogueWriteGuard);

    delete process.env.SUPERCONDUCTOR_ROLE;
    evaluator.assertRootModelRestricted();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
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

describe("SwarmPermissionEvaluator.getExecutionMode", () => {
  const tempDir = path.join(__dirname, "temp-test-mode");
  const dummyConfig = path.join(tempDir, "agent-config.md");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(dummyConfig, "Swarm Mode: inactive");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let originalCI: string | undefined;
  beforeEach(() => {
    originalCI = process.env.CI;
  });

  afterEach(() => {
    if (originalCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCI;
    }
  });

  it("returns HEADLESS when process.env.CI = 'true'", () => {
    process.env.CI = 'true';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.HEADLESS);
  });

  it("returns HEADLESS when process.env.CI = '1'", () => {
    process.env.CI = '1';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.HEADLESS);
  });

  it("returns HEADLESS when constructed with { headless: true } option", () => {
    delete process.env.CI;
    const evaluator = new SwarmPermissionEvaluator(dummyConfig, { headless: true });
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.HEADLESS);
  });

  it("returns INTERACTIVE when no CI env and no headless option", () => {
    delete process.env.CI;
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("returns INTERACTIVE after deleting process.env.CI", () => {
    process.env.CI = 'true';
    delete process.env.CI;
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  // SEC-2 + COR-1: CI falsy string values must NOT trigger HEADLESS mode
  it("SEC-2: returns INTERACTIVE when process.env.CI = 'false'", () => {
    process.env.CI = 'false';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("SEC-2: returns INTERACTIVE when process.env.CI = '0'", () => {
    process.env.CI = '0';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("SEC-2: returns INTERACTIVE when process.env.CI = 'no'", () => {
    process.env.CI = 'no';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("SEC-2: returns INTERACTIVE when process.env.CI = 'off'", () => {
    process.env.CI = 'off';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("SEC-2: returns INTERACTIVE when process.env.CI = '' (empty string)", () => {
    process.env.CI = '';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.INTERACTIVE);
  });

  it("SEC-2: returns HEADLESS when process.env.CI = 'TRUE' (case-insensitive)", () => {
    process.env.CI = 'TRUE';
    const evaluator = new SwarmPermissionEvaluator(dummyConfig);
    expect(evaluator.getExecutionMode()).toBe(ExecutionMode.HEADLESS);
  });
});

describe("SwarmPermissionEvaluator.assertRootWriteAllowed", () => {
  const tempDir = path.join(__dirname, "temp-test-rogue");
  const activeConfig = path.join(tempDir, "agent-config-active.md");
  const inactiveConfig = path.join(tempDir, "agent-config-inactive.md");

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(activeConfig, "Swarm Mode: active");
    fs.writeFileSync(inactiveConfig, "Swarm Mode: inactive");
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  let originalRole: string | undefined;
  beforeEach(() => {
    originalRole = process.env.SUPERCONDUCTOR_ROLE;
  });

  afterEach(() => {
    if (originalRole === undefined) {
      delete process.env.SUPERCONDUCTOR_ROLE;
    } else {
      process.env.SUPERCONDUCTOR_ROLE = originalRole;
    }
  });

  it("throws RogueWriteAttemptError when SUPERCONDUCTOR_ROLE=root and swarm active, writing to packages/engine/src/foo.ts", () => {
    process.env.SUPERCONDUCTOR_ROLE = "root";
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    expect(() => evaluator.assertRootWriteAllowed("packages/engine/src/foo.ts")).toThrow(RogueWriteAttemptError);
  });

  it("does NOT throw when SUPERCONDUCTOR_ROLE=processor and swarm active, writing to packages/engine/src/foo.ts", () => {
    process.env.SUPERCONDUCTOR_ROLE = "processor";
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    expect(() => evaluator.assertRootWriteAllowed("packages/engine/src/foo.ts")).not.toThrow();
  });

  it("does NOT throw when SUPERCONDUCTOR_ROLE=root and swarm active, writing to superconductor/tracks.md (not protected)", () => {
    process.env.SUPERCONDUCTOR_ROLE = "root";
    const evaluator = new SwarmPermissionEvaluator(activeConfig);
    expect(() => evaluator.assertRootWriteAllowed("superconductor/tracks.md")).not.toThrow();
  });

  it("does NOT throw when SUPERCONDUCTOR_ROLE=root but swarm is NOT active", () => {
    process.env.SUPERCONDUCTOR_ROLE = "root";
    const evaluator = new SwarmPermissionEvaluator(inactiveConfig);
    expect(() => evaluator.assertRootWriteAllowed("packages/engine/src/foo.ts")).not.toThrow();
  });
});
