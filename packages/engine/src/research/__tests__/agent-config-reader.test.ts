import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AgentConfigReader } from '../agent-config-reader.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  };
});

describe('AgentConfigReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support researchProvider: "deerflow" in superconductor/agent-config.md', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p.toString().endsWith(path.join('superconductor', 'agent-config.md'));
    });
    vi.mocked(fs.readFileSync).mockReturnValue(`
# Agent Configuration
researchProvider: 'deerflow'
mode: 'ultra'
endpoint: 'http://localhost:2026'
    `);

    const config = AgentConfigReader.getResearchProviderConfig('/mock/workspace');
    expect(config).toBeDefined();
    expect(config?.providerName).toBe('deerflow');
    expect(config?.options.mode).toBe('ultra');
    expect(config?.options.endpoint).toBe('http://localhost:2026');
  });

  it('should support Research Provider in .superconductor/agent-config.md', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return p.toString().endsWith(path.join('.superconductor', 'agent-config.md'));
    });
    vi.mocked(fs.readFileSync).mockReturnValue(`
Research Provider: gemini-api-deep-research
Auth Mode: vertexai
    `);

    const config = AgentConfigReader.getResearchProviderConfig('/mock/workspace');
    expect(config).toBeDefined();
    expect(config?.providerName).toBe('gemini-api-deep-research');
    expect(config?.options.authMode).toBe('vertexai');
    expect(config?.options.mode).toBeUndefined();
  });

  it('should return undefined if neither config file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const config = AgentConfigReader.getResearchProviderConfig('/mock/workspace');
    expect(config).toBeUndefined();
  });

  it('should return undefined if file exists but no provider specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Just notes\nSome text');

    const config = AgentConfigReader.getResearchProviderConfig('/mock/workspace');
    expect(config).toBeUndefined();
  });
});
