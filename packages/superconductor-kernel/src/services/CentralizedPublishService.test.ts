import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CentralizedPublishService } from './CentralizedPublishService.js';
import { AtomicGitService } from './AtomicGitService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock AtomicGitService
vi.mock('./AtomicGitService.js', () => {
  const MockAtomicGitService = vi.fn().mockImplementation(function() {
    return {
      commitAndPush: vi.fn().mockResolvedValue({ success: true }),
    };
  });
  return {
    AtomicGitService: MockAtomicGitService,
  };
});

describe('CentralizedPublishService', () => {
  let tempRegistry: string;
  let service: CentralizedPublishService;

  beforeEach(async () => {
    tempRegistry = await fs.mkdtemp(path.join(os.tmpdir(), 'reg-test-'));
    service = new CentralizedPublishService(tempRegistry);
  });

  afterEach(async () => {
    await fs.rm(tempRegistry, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should publish a component with multiple files', async () => {
    const payload: any = {
      files: [
        { path: 'index.tsx', content: 'export const Button = () => <button />' },
        { path: 'styles.css', content: '.btn { color: red }' },
      ],
      metadata: {
        name: 'Button',
        family: 'button',
        variant: 'base',
        type: 'atom',
        description: 'A base button',
        intent: 'action',
        comments: ['Initial version'],
      }
    };

    const result = await service.publish(payload);

    expect(result.success).toBe(true);

    const indexFile = await fs.readFile(path.join(tempRegistry, 'components/button/base/index.tsx'), 'utf-8');
    expect(indexFile).toBe(payload.files[0].content);

    const regFile = await fs.readFile(path.join(tempRegistry, 'components/button/registry.json'), 'utf-8');
    const registry = JSON.parse(regFile);
    expect(registry.variants.base.comments).toContain('Initial version');
  });

  it('should add a comment to an existing variant', async () => {
    const familyDir = path.join(tempRegistry, 'components/button');
    await fs.mkdir(familyDir, { recursive: true });
    const regPath = path.join(familyDir, 'registry.json');
    await fs.writeFile(regPath, JSON.stringify({
      name: 'button',
      variants: {
        base: { comments: ['old comment'] }
      }
    }));

    await service.addComment('button', 'base', 'new comment');

    const regFile = await fs.readFile(regPath, 'utf-8');
    const registry = JSON.parse(regFile);
    expect(registry.variants.base.comments).toContain('new comment');
    expect(registry.variants.base.comments).toContain('old comment');
  });
});
