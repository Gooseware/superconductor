import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskLockManager } from '../src/concurrency/lock-manager';
import fs from 'fs';
import path from 'path';

describe('TaskLockManager', () => {
    const testDir = path.join(process.cwd(), '.test-locks');
    let lockManager: TaskLockManager;

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        lockManager = new TaskLockManager(testDir);
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should acquire a lock successfully', async () => {
        const acquired = await lockManager.acquireLock('task-1', 'agent-a');
        expect(acquired).toBe(true);
        expect(lockManager.getLockHolder('task-1')).toBe('agent-a');
    });

    it('should fail to acquire an already held lock', async () => {
        await lockManager.acquireLock('task-2', 'agent-a');
        const acquired = await lockManager.acquireLock('task-2', 'agent-b');
        expect(acquired).toBe(false);
    });

    it('should release a held lock', async () => {
        await lockManager.acquireLock('task-3', 'agent-a');
        const released = await lockManager.releaseLock('task-3', 'agent-a');
        expect(released).toBe(true);
        expect(lockManager.getLockHolder('task-3')).toBeNull();
    });

    it('should fail to release a lock held by another agent', async () => {
        await lockManager.acquireLock('task-4', 'agent-a');
        const released = await lockManager.releaseLock('task-4', 'agent-b');
        expect(released).toBe(false);
        expect(lockManager.getLockHolder('task-4')).toBe('agent-a');
    });
});
