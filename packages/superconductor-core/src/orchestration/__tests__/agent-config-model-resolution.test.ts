import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveModelTier,
  readAgentConfig,
  buildModelConfig,
  AgentConfig,
} from '../agent-config-model-resolution.js';

describe('resolveModelTier — model ID → tier enum mapping', () => {
  it('maps gemini-*-flash-* variants to "flash"', () => {
    expect(resolveModelTier('gemini-3.7-flash-high')).toBe('flash');
    expect(resolveModelTier('gemini-2.0-flash')).toBe('flash');
    expect(resolveModelTier('gemini-flash')).toBe('flash');
    expect(resolveModelTier('google-flash-high')).toBe('flash');
  });

  it('maps gemini-*-flash-lite* to "flash_lite"', () => {
    expect(resolveModelTier('gemini-3.6-flash-lite')).toBe('flash_lite');
    expect(resolveModelTier('gemini-2.0-flash-lite')).toBe('flash_lite');
    expect(resolveModelTier('flash-lite')).toBe('flash_lite');
  });

  it('maps gemini-*-pro-* variants to "pro"', () => {
    expect(resolveModelTier('gemini-3.1-pro-high')).toBe('pro');
    expect(resolveModelTier('gemini-2.5-pro')).toBe('pro');
    expect(resolveModelTier('gemini-pro')).toBe('pro');
    expect(resolveModelTier('pro')).toBe('pro');
  });

  it('maps claude-*-sonnet-* to "pro"', () => {
    expect(resolveModelTier('claude-sonnet-4-6')).toBe('pro');
    expect(resolveModelTier('claude-3-5-sonnet-20241022')).toBe('pro');
    expect(resolveModelTier('claude-sonnet-latest')).toBe('pro');
  });

  it('maps claude-*-opus-* to "pro"', () => {
    expect(resolveModelTier('claude-opus-4-6-thinking')).toBe('pro');
    expect(resolveModelTier('claude-3-opus-20240229')).toBe('pro');
    expect(resolveModelTier('claude-opus')).toBe('pro');
  });

  it('maps gpt-oss-*-medium to "flash"', () => {
    expect(resolveModelTier('gpt-oss-120b-medium')).toBe('flash');
    expect(resolveModelTier('gpt-oss-medium')).toBe('flash');
  });

  it('maps unknown IDs to "flash" (never "inherit")', () => {
    expect(resolveModelTier('some-unknown-model')).toBe('flash');
    expect(resolveModelTier('inherit')).toBe('flash');
    expect(resolveModelTier('')).toBe('flash');
    expect(resolveModelTier(undefined as unknown as string)).toBe('flash');
  });
});

describe('readAgentConfig — resolution order', () => {
  let tempDirs: string[] = [];

  const createTempDir = (prefix: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // cleanup ignore
      }
    }
    tempDirs = [];
  });

  it('returns project override when superconductor/agent-config.md exists', () => {
    const projectDir = createTempDir('sc-proj-');
    const scDir = path.join(projectDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });

    const configContent = `# Agent Configuration

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`gemini-3.7-flash-high\` |
| superconductor-reviewer (quorum) | \`gemini-3.7-flash-high\` |
| superconductor-dreamer | \`claude-sonnet-4-6\` |
| superconductor-oracle | \`claude-sonnet-4-6\` |
| remediation-processor | \`gemini-3.7-flash-high\` |
`;
    fs.writeFileSync(path.join(scDir, 'agent-config.md'), configContent, 'utf-8');

    const result = readAgentConfig(projectDir);

    expect(result).toEqual({
      processor: 'gemini-3.7-flash-high',
      reviewer: 'gemini-3.7-flash-high',
      dreamer: 'claude-sonnet-4-6',
      oracle: 'claude-sonnet-4-6',
      remediator: 'gemini-3.7-flash-high',
    });
  });

  it('falls back to global ~/.gemini/agent-config.md when no project config', () => {
    const emptyProjDir = createTempDir('sc-proj-empty-');
    const fakeHomeDir = createTempDir('sc-fake-home-');
    const geminiDir = path.join(fakeHomeDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });

    const globalConfigContent = `# Global Agent Configuration

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`gemini-3.6-flash-lite\` |
| superconductor-reviewer (quorum) | \`gemini-3.6-flash-lite\` |
| superconductor-dreamer | \`claude-opus-4-6-thinking\` |
| superconductor-oracle | \`claude-opus-4-6-thinking\` |
| remediation-processor | \`gemini-3.6-flash-lite\` |
`;
    const globalPath = path.join(geminiDir, 'agent-config.md');
    fs.writeFileSync(globalPath, globalConfigContent, 'utf-8');

    const result = readAgentConfig(emptyProjDir, { globalConfigPath: globalPath });

    expect(result).toEqual({
      processor: 'gemini-3.6-flash-lite',
      reviewer: 'gemini-3.6-flash-lite',
      dreamer: 'claude-opus-4-6-thinking',
      oracle: 'claude-opus-4-6-thinking',
      remediator: 'gemini-3.6-flash-lite',
    });
  });

  it('project override takes precedence over global config', () => {
    const projectDir = createTempDir('sc-proj-override-');
    const scDir = path.join(projectDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });

    const projectContent = `# Project Config

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`gemini-3.7-flash-high\` |
| superconductor-reviewer (quorum) | \`gemini-3.7-flash-high\` |
| superconductor-dreamer | \`claude-sonnet-4-6\` |
| superconductor-oracle | \`claude-sonnet-4-6\` |
| remediation-processor | \`gemini-3.7-flash-high\` |
`;
    fs.writeFileSync(path.join(scDir, 'agent-config.md'), projectContent, 'utf-8');

    const fakeHomeDir = createTempDir('sc-fake-home-2-');
    const geminiDir = path.join(fakeHomeDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });

    const globalContent = `# Global Config

## Swarm Agent Model Assignments

| Role | Model |
|------|-------|
| superconductor-processor | \`gemini-3.6-flash-lite\` |
| superconductor-reviewer (quorum) | \`gemini-3.6-flash-lite\` |
| superconductor-dreamer | \`claude-opus-4-6-thinking\` |
| superconductor-oracle | \`claude-opus-4-6-thinking\` |
| remediation-processor | \`gemini-3.6-flash-lite\` |
`;
    const globalPath = path.join(geminiDir, 'agent-config.md');
    fs.writeFileSync(globalPath, globalContent, 'utf-8');

    const result = readAgentConfig(projectDir, { globalConfigPath: globalPath });

    expect(result.processor).toBe('gemini-3.7-flash-high');
    expect(result.dreamer).toBe('claude-sonnet-4-6');
  });

  it('returns empty config when neither file exists', () => {
    const emptyProjDir = createTempDir('sc-proj-empty-none-');
    const fakeEmptyHomeDir = createTempDir('sc-fake-home-empty-');
    const nonExistentGlobal = path.join(fakeEmptyHomeDir, '.gemini', 'agent-config.md');

    const result = readAgentConfig(emptyProjDir, { globalConfigPath: nonExistentGlobal });
    expect(result).toEqual({});
  });

  it('handles non-existent path gracefully', () => {
    const fakeEmptyHomeDir = createTempDir('sc-fake-home-nonexist-');
    const nonExistentGlobal = path.join(fakeEmptyHomeDir, '.gemini', 'agent-config.md');

    const result = readAgentConfig('/path/that/definitely/does/not/exist/123456', {
      globalConfigPath: nonExistentGlobal,
    });
    expect(result).toEqual({});
  });
});

describe('buildModelConfig — completeness', () => {
  it('all 5 roles present in output with full config', () => {
    const config: AgentConfig = {
      processor: 'gemini-3.7-flash-high',
      reviewer: 'gemini-3.7-flash-high',
      dreamer: 'claude-sonnet-4-6',
      oracle: 'claude-sonnet-4-6',
      remediator: 'gemini-3.7-flash-high',
    };

    const result = buildModelConfig(config);

    expect(result).toEqual({
      processor: 'flash',
      reviewer: 'flash',
      dreamer: 'pro',
      oracle: 'pro',
      remediator: 'flash',
    });
  });

  it('all 5 roles present and use safe defaults when config is empty', () => {
    const result = buildModelConfig({});

    expect(result).toEqual({
      processor: 'flash',
      reviewer: 'flash',
      dreamer: 'pro',
      oracle: 'pro',
      remediator: 'flash',
    });
  });

  it('partial config resolves provided roles and falls back to defaults for others', () => {
    const config: AgentConfig = {
      processor: 'gemini-3.6-flash-lite',
      oracle: 'gemini-3.1-pro-high',
    };

    const result = buildModelConfig(config);

    expect(result).toEqual({
      processor: 'flash_lite',
      reviewer: 'flash',
      dreamer: 'pro',
      oracle: 'pro',
      remediator: 'flash',
    });
  });

  it('no role maps to "inherit"', () => {
    const emptyResult = buildModelConfig({});
    for (const [role, tier] of Object.entries(emptyResult)) {
      expect(tier).not.toBe('inherit');
    }

    const fullConfig: AgentConfig = {
      processor: 'gemini-3.7-flash-high',
      reviewer: 'gemini-3.7-flash-high',
      dreamer: 'claude-sonnet-4-6',
      oracle: 'claude-sonnet-4-6',
      remediator: 'gemini-3.7-flash-high',
    };
    const fullResult = buildModelConfig(fullConfig);
    for (const [role, tier] of Object.entries(fullResult)) {
      expect(tier).not.toBe('inherit');
    }

    const inheritConfig: AgentConfig = {
      processor: 'inherit',
      reviewer: 'inherit',
      dreamer: 'inherit',
      oracle: 'inherit',
      remediator: 'inherit',
    };
    const inheritResult = buildModelConfig(inheritConfig);
    for (const [role, tier] of Object.entries(inheritResult)) {
      expect(tier).not.toBe('inherit');
      expect(['flash', 'flash_lite', 'pro']).toContain(tier);
    }
  });

  it('uses "flash" as safe default for unknown model IDs', () => {
    const config: AgentConfig = {
      processor: 'custom-unknown-model-v1',
      reviewer: 'unrecognized-xyz',
    };

    const result = buildModelConfig(config);

    expect(result.processor).toBe('flash');
    expect(result.reviewer).toBe('flash');
  });
});
