import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SmartModelResolver } from '../src/routing/SmartModelResolver.js';

describe('SmartModelResolver', () => {
  const tmpDir = path.join(os.tmpdir(), `smart-model-resolver-test-${Date.now()}`);
  const configPath = path.join(tmpDir, 'agent-config.md');
  const activeModelPath = path.join(tmpDir, 'active_model.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses agent-config mappings correctly', () => {
    const configContent = `
# Agent Config
- **Tier 2 (Triage & Extraction):** \`gemini-2.0-flash-lite\`
- **Tier 3 (Standard Inference):** \`gemini-2.5-pro\`
- **Tier 4 (Frontier Reasoning):** \`gemini-2.5-pro\` (thinking)
`;
    fs.writeFileSync(configPath, configContent);

    const resolver = new SmartModelResolver({ agentConfigPath: configPath, activeModelPath });
    const mappings = resolver.parseAgentConfig();

    expect(mappings.tier2).toBe('gemini-2.0-flash-lite');
    expect(mappings.tier3).toBe('gemini-2.5-pro');
  });

  it('resolves model and signals shouldPrompt when no previous active model exists', async () => {
    const resolver = new SmartModelResolver({ agentConfigPath: configPath, activeModelPath });
    const { selection, shouldPrompt } = await resolver.resolve('tier3');

    expect(selection.model).toBe('gemini-2.5-pro');
    expect(shouldPrompt).toBe(true);
    expect(fs.existsSync(activeModelPath)).toBe(true);
  });

  it('signals shouldPrompt = false when resolved model equals last active model', async () => {
    const resolver = new SmartModelResolver({ agentConfigPath: configPath, activeModelPath });
    await resolver.resolve('tier3'); // first run populates cache

    const secondRun = await resolver.resolve('tier3');
    expect(secondRun.shouldPrompt).toBe(false);
  });

  it('signals shouldPrompt = true when forceSwitch is true', async () => {
    const resolver = new SmartModelResolver({ agentConfigPath: configPath, activeModelPath, forceSwitch: true });
    await resolver.resolve('tier3');

    const secondRun = await resolver.resolve('tier3');
    expect(secondRun.shouldPrompt).toBe(true);
  });
});
