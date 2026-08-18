import { describe, it, expect } from 'vitest';
import { SUPERCONDUCTOR_TIERS, ModelChooserDialog } from '../model-chooser-dialog.js';

describe('ModelChooserDialog - Tiers', () => {
  it('exports SUPERCONDUCTOR_TIERS correctly', () => {
    expect(SUPERCONDUCTOR_TIERS).toBeDefined();
    expect(SUPERCONDUCTOR_TIERS.length).toBe(3);
    
    expect(SUPERCONDUCTOR_TIERS[0].id).toBe('flash');
    expect(SUPERCONDUCTOR_TIERS[0].roles).toEqual([
      'superconductor-processor',
      'superconductor-reviewer',
      'remediation-processor',
    ]);
    
    expect(SUPERCONDUCTOR_TIERS[1].id).toBe('pro');
    expect(SUPERCONDUCTOR_TIERS[2].id).toBe('pro-thinking');
  });

  it('buildModePrompt returns correct prompt object', () => {
    const dialog = new ModelChooserDialog();
    const prompt = dialog.buildModePrompt();
    
    expect(prompt.name).toBe('mode');
    expect(prompt.type).toBe('select');
    expect(prompt.choices.length).toBe(2);
    expect(prompt.choices[0].value).toBe('tier');
    expect(prompt.choices[1].value).toBe('individual');
  });

  it('buildTierPrompts returns 3 prompts with correct initial indexes', () => {
    const dialog = new ModelChooserDialog();
    const mockModels = [
      { id: 'modelA', name: 'Model A', type: 'model', provider: 'test' },
      { id: 'modelB', name: 'Model B', type: 'model', provider: 'test' }
    ];
    
    // flash tier starts with processor, its current assignment is modelB (index 1)
    const assignments = {
      'superconductor-processor': 'modelB',
      'superconductor-dreamer': 'modelA',
      'superconductor-oracle': 'unknown'
    };
    
    const prompts = dialog.buildTierPrompts(mockModels, assignments);
    expect(prompts.length).toBe(3);
    
    expect(prompts[0].name).toBe('flash');
    expect(prompts[0].initial).toBe(1); // 'modelB' index
    
    expect(prompts[1].name).toBe('pro');
    expect(prompts[1].initial).toBe(0); // 'modelA' index
    
    expect(prompts[2].name).toBe('pro-thinking');
    expect(prompts[2].initial).toBe(0); // 'unknown' => 0
    
    // Check message mentions roles
    expect(prompts[0].message).toContain('superconductor-processor');
    expect(prompts[0].message).toContain('superconductor-reviewer');
  });
});
