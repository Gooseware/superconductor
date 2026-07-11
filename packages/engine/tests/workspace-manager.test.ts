import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceManager } from '../src/concurrency/workspace-manager';
import fs from 'fs';
import path from 'path';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
    execSync: vi.fn()
}));

describe('WorkspaceManager', () => {
    const testWorkspacesDir = path.join(process.cwd(), '.test-workspaces');
    let workspaceManager: WorkspaceManager;

    beforeEach(() => {
        if (!fs.existsSync(testWorkspacesDir)) {
            fs.mkdirSync(testWorkspacesDir, { recursive: true });
        }
        workspaceManager = new WorkspaceManager('mock-repo', testWorkspacesDir);
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (fs.existsSync(testWorkspacesDir)) {
            fs.rmSync(testWorkspacesDir, { recursive: true, force: true });
        }
    });

    it('should create a workspace', () => {
        const workspacePath = workspaceManager.createWorkspace('task-1');
        expect(workspacePath).toContain('workspace_task-1');
        expect(child_process.execSync).toHaveBeenCalledWith(`git clone mock-repo ${workspacePath}`, { stdio: 'ignore' });
    });

    it('should cleanup a workspace', () => {
        const workspacePath = workspaceManager.createWorkspace('task-2');
        if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
        }
        workspaceManager.cleanupWorkspace('task-2');
        expect(fs.existsSync(workspacePath)).toBe(false);
    });
});
