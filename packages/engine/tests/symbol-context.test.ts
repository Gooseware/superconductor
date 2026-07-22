import { describe, it, expect } from 'vitest';
import { resolveSymbols, generateDiffPayload, buildContext } from '../src/context/builder.js';
import { DagNode } from '../src/types/index.js';

describe('AST Symbol Context Builder & Token Optimization', () => {
  it('should resolve symbols online or via fallback reader', async () => {
    const symbols = [{ file: 'src/engine.ts', symbol: 'Engine' }];
    const resolved = await resolveSymbols(symbols);
    expect(resolved).toContain('Symbol Context: src/engine.ts -> Engine');
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('should generate diff-only payload for Reviewer subagents', async () => {
    const files = ['src/engine.ts'];
    const payload = await generateDiffPayload(files);
    expect(payload).toContain('--- Diff Payload ---');
    expect(payload.length).toBeLessThan(50000);
  });

  it('should attach symbolDependencies and diff-only payload to buildContext output when role is reviewer', async () => {
    const node: DagNode = {
      id: 'task-1',
      role: 'reviewer',
      tier: 3,
      status: 'pending',
      prompt: 'Review the changes',
      contextFiles: ['src/engine.ts'],
      symbolDependencies: [{ file: 'src/engine.ts', symbol: 'Engine' }],
      toolSurface: 'readonly'
    };

    const config = buildContext(node, 'common ctx');
    expect(config.prompt).toContain('Context Files: src/engine.ts');
  });
});
