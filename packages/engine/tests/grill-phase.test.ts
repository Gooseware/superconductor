import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { SkillTriggerEngine } from '../src/skills/skill-trigger-engine.js';
import type { DagNode } from '../src/types/dag.types.js';

describe('Grilling Phase Rule Enforcement', () => {
  it('should inject --grill flag rules and CONTEXT.md creation instructions when new-track is triggered', () => {
    const skillsDir = path.resolve(__dirname, '../../../skills');
    const engine = new SkillTriggerEngine(skillsDir);

    const task: DagNode = {
      id: 'test-grill-1',
      prompt: 'superconductor:newTrack --grill for a new authentication feature',
      dependencies: []
    };

    const matches = engine.match(task);
    
    expect(matches.length).toBeGreaterThan(0);
    const newTrackMatch = matches.find(m => m.manifest.metadata.name === 'new-track');
    expect(newTrackMatch).toBeDefined();

    const context = engine.buildSkillContext([newTrackMatch!]);

    // Verify --grill flag parsing rule is injected
    expect(context).toContain('--grill');
    expect(context).toContain('Grilling Phase');

    // Verify CONTEXT.md creation logic is injected
    expect(context).toContain('CONTEXT.md');
    expect(context).toContain('ubiquitous language');
  });
});
