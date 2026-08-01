import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AtomicGitService } from './AtomicGitService.js';
import { simpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock simple-git
vi.mock('simple-git', () => {
  const mockGit = {
    pull: vi.fn().mockResolvedValue({}),
    add: vi.fn().mockResolvedValue({}),
    commit: vi.fn().mockResolvedValue({}),
    push: vi.fn().mockResolvedValue({}),
    init: vi.fn().mockResolvedValue({}),
    addConfig: vi.fn().mockResolvedValue({}),
    log: vi.fn().mockResolvedValue({ latest: { message: 'feat: add test file' } }),
  };
  return {
    simpleGit: vi.fn(() => mockGit),
  };
});

describe('AtomicGitService', () => {
  let tempRepo: string;
  let service: AtomicGitService;
  let mockGit: any;

  beforeEach(async () => {
    tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'git-test-'));
    service = new AtomicGitService(tempRepo);
    mockGit = (simpleGit as any)();
  });

  afterEach(async () => {
    await fs.rm(tempRepo, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should pull, stage, commit and push changes', async () => {
    const message = 'feat: add test file';
    const files = ['test.txt'];

    await service.commitAndPush(message, files);

    expect(mockGit.pull).toHaveBeenCalledWith('origin', 'main', ['--rebase']);
    expect(mockGit.add).toHaveBeenCalledWith('test.txt');
    expect(mockGit.commit).toHaveBeenCalledWith(message);
    expect(mockGit.push).toHaveBeenCalledWith('origin', 'main');
  });

  it('should throw error if pull fails', async () => {
    mockGit.pull.mockRejectedValue(new Error('Pull conflict'));

    await expect(service.commitAndPush('msg', ['.'])).rejects.toThrow('Git operation failed: Pull conflict');
  });
});
