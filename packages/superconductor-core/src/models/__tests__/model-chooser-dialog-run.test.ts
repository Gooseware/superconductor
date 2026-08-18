import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelChooserDialog, SUPERCONDUCTOR_TIERS } from '../model-chooser-dialog.js';
import { ConfigScope } from '../agent-config-writer.js';

describe('ModelChooserDialog - run() method routing', () => {
  let promptMock: ReturnType<typeof vi.fn>;
  let loggerMock: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  
  beforeEach(() => {
    promptMock = vi.fn();
    loggerMock = { log: vi.fn(), error: vi.fn() };
  });

  const createDialog = () => new ModelChooserDialog({
    promptFn: promptMock,
    logger: loggerMock,
    // Mock the models to avoid actual discovery
    modelCatalog: {
      refresh: () => [{ id: 'modelA', name: 'Model A' }],
      getModels: () => [{ id: 'modelA', name: 'Model A' }]
    } as any,
    configWriter: {
      resolve: () => ({ roles: {} }),
      writeConfig: vi.fn(),
      writeProjectConfig: vi.fn(),
      writeGlobalConfig: vi.fn()
    } as any
  });

  it('AC-1: interactive run calls mode-select first', async () => {
    promptMock.mockResolvedValueOnce({ mode: 'tier' });
    promptMock.mockResolvedValueOnce({ flash: 'modelA', pro: 'modelA', 'pro-thinking': 'modelA' });
    promptMock.mockResolvedValueOnce({ scope: 'session' });

    const dialog = createDialog();
    await dialog.run([]);
    
    // Check first prompt
    expect(promptMock).toHaveBeenCalledTimes(3);
    const firstPromptArg = promptMock.mock.calls[0][0];
    expect(firstPromptArg.name).toBe('mode');
  });

  it('AC-3: mode answer individual calls buildRolePrompts (5 pickers)', async () => {
    promptMock.mockResolvedValueOnce({ mode: 'individual' });
    promptMock.mockResolvedValueOnce({ 'superconductor-processor': 'modelA' });
    promptMock.mockResolvedValueOnce({ scope: 'session' });

    const dialog = createDialog();
    await dialog.run([]);
    
    const secondPromptArg = promptMock.mock.calls[1][0];
    // Array of 5 roles
    expect(Array.isArray(secondPromptArg)).toBe(true);
    expect(secondPromptArg.length).toBe(5);
    expect(secondPromptArg[0].name).toBe('superconductor-processor');
  });

  it('AC-4: tier answers expand to all 5 role assignments', async () => {
    promptMock.mockResolvedValueOnce({ mode: 'tier' });
    promptMock.mockResolvedValueOnce({ flash: 'modelX', pro: 'modelY', 'pro-thinking': 'modelZ' });
    promptMock.mockResolvedValueOnce({ scope: 'session' });

    const dialog = createDialog();
    const result = await dialog.run([]);
    
    expect(result.assignments['superconductor-processor']).toBe('modelX');
    expect(result.assignments['superconductor-reviewer']).toBe('modelX');
    expect(result.assignments['remediation-processor']).toBe('modelX');
    expect(result.assignments['superconductor-dreamer']).toBe('modelY');
    expect(result.assignments['superconductor-oracle']).toBe('modelZ');
  });

  it('AC-5: --tier-mode flag skips mode prompt', async () => {
    promptMock.mockResolvedValueOnce({ flash: 'modelX', pro: 'modelY', 'pro-thinking': 'modelZ' });
    promptMock.mockResolvedValueOnce({ scope: 'session' });

    const dialog = createDialog();
    await dialog.run(['--tier-mode']);
    
    const firstPromptArg = promptMock.mock.calls[0][0];
    expect(Array.isArray(firstPromptArg)).toBe(true);
    expect(firstPromptArg.length).toBe(3);
    expect(firstPromptArg[0].name).toBe('flash');
  });

  it('AC-6: --individual-mode flag skips mode prompt', async () => {
    promptMock.mockResolvedValueOnce({}); // empty role assignments to quit
    
    const dialog = createDialog();
    await dialog.run(['--individual-mode']);
    
    const firstPromptArg = promptMock.mock.calls[0][0];
    expect(Array.isArray(firstPromptArg)).toBe(true);
    expect(firstPromptArg.length).toBe(5);
  });

  it('AC-7: both flags present uses tier mode and logs warning', async () => {
    promptMock.mockResolvedValueOnce({ flash: 'modelX' }); // tier prompts
    promptMock.mockResolvedValueOnce({ scope: 'session' });
    
    const dialog = createDialog();
    await dialog.run(['--tier-mode', '--individual-mode']);
    
    const firstPromptArg = promptMock.mock.calls[0][0];
    expect(firstPromptArg.length).toBe(3);
    
    expect(loggerMock.log).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Both --tier-mode and --individual-mode provided; using --tier-mode.')
    );
  });

  it('AC-8: cancelling mode prompt returns cancelled true', async () => {
    promptMock.mockResolvedValueOnce({});
    
    const dialog = createDialog();
    const result = await dialog.run([]);
    
    expect(result.cancelled).toBe(true);
  });

  it('AC-9: cancelling tier prompt returns cancelled true', async () => {
    promptMock.mockResolvedValueOnce({ mode: 'tier' });
    promptMock.mockResolvedValueOnce({}); // empty tier answer
    
    const dialog = createDialog();
    const result = await dialog.run([]);
    
    expect(result.cancelled).toBe(true);
  });
});
