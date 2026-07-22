import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Engine } from '../src/engine.js';
import { TaskGraph } from '../src/types/dag.types.js';

describe('Engine Skill Trigger Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-skill-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should dynamically load and inject matched skill context at dispatch time', async () => {
    const skillsDir = path.join(tempDir, 'skills');
    const skillDir = path.join(skillsDir, 'implement');
    fs.mkdirSync(skillDir, { recursive: true });

    const manifest = {
      version: '1.0',
      triggers: { keywords: ['implement'] },
      metadata: { name: 'implement', marketplace: '1p', version: '1.0.0' }
    };
    fs.writeFileSync(path.join(skillDir, 'skill-rules.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Implement Skill Instructions');

    const node: DagNode = {
      id: 'task-1',
      role: 'editor',
      tier: 3,
      status: 'pending',
      prompt: 'Please implement the feature',
      dependencies: []
    };

    const engine = new Engine({ nodes: { [node.id]: node }, edges: [] }, { skillsDir });

    await engine.execute();

    expect(node.prompt).toContain('--- Active Skills ---');
    expect(node.prompt).toContain('--- Skill: implement ---');
    expect(node.prompt).toContain('# Implement Skill Instructions');
  });
});
