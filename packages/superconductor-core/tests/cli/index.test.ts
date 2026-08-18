import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCli } from '../../src/cli/index.js';

const mockExecuteTrack = vi.fn().mockResolvedValue({ workUnits: [] });

vi.mock('@superconductor/engine', () => ({
  SwarmOrchestratorCLI: class {
    executeTrack = mockExecuteTrack;
  }
}));

describe('CLI - swarm-execute preflight flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => undefined as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes noPreflight and preflightTimeoutMs to executeTrack', async () => {
    await runCli(['swarm-execute', 'test-track', '--no-preflight', '--preflight-timeout', '5000']);
    expect(mockExecuteTrack).toHaveBeenCalledWith(
      expect.any(String),
      'test-track',
      { noPreflight: true, preflightTimeoutMs: 5000 }
    );
  });

  it('handles default values', async () => {
    await runCli(['swarm-execute', 'test-track']);
    expect(mockExecuteTrack).toHaveBeenCalledWith(
      expect.any(String),
      'test-track',
      { noPreflight: false, preflightTimeoutMs: undefined }
    );
  });
});
