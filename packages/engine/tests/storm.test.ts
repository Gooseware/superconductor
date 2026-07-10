import { describe, it, expect, beforeEach } from 'vitest';
import { StormController } from '../src/concurrency/storm';

describe('STORM Concurrency Controller', () => {
    let storm: StormController;

    beforeEach(() => {
        storm = new StormController();
    });

    it('requestAccess() grants access and tracks ownership when files are unowned', () => {
        const result = storm.requestAccess('task-1', ['file1.txt', 'file2.txt']);
        expect(result.success).toBe(true);
        expect(result.conflicts).toHaveLength(0);
        
        // Verify ownership is tracked by having another task request the same file
        const nextResult = storm.requestAccess('task-2', ['file1.txt']);
        expect(nextResult.success).toBe(false);
    });

    it('requestAccess() returns conflict (denied) when a file is already owned by another task', () => {
        storm.requestAccess('task-1', ['file1.txt', 'file2.txt']);
        
        const result = storm.requestAccess('task-2', ['file2.txt', 'file3.txt']);
        expect(result.success).toBe(false);
        expect(result.conflicts).toHaveLength(1);
        expect(result.conflicts[0].file).toBe('file2.txt');
        expect(result.conflicts[0].conflictingTasks).toContain('task-1');
        expect(result.conflicts[0].conflictingTasks).toContain('task-2');
    });

    it('releaseAccess() frees the file for other tasks', () => {
        storm.requestAccess('task-1', ['file1.txt', 'file2.txt']);
        storm.releaseAccess('task-1');

        const result = storm.requestAccess('task-2', ['file2.txt', 'file3.txt']);
        expect(result.success).toBe(true);
        expect(result.conflicts).toHaveLength(0);
    });

    it('getConflictReport() generates a correct report of all current conflicts', () => {
        storm.requestAccess('task-1', ['file1.txt']);
        storm.requestAccess('task-2', ['file1.txt']); // Conflict created here
        storm.requestAccess('task-3', ['file1.txt']); // Another task conflicting

        const report = storm.getConflictReport();
        expect(report).toHaveLength(1);
        expect(report[0].file).toBe('file1.txt');
        expect(report[0].conflictingTasks).toContain('task-1');
        expect(report[0].conflictingTasks).toContain('task-2');
        expect(report[0].conflictingTasks).toContain('task-3');
        expect(report[0].resolved).toBe(false);
        
        // Releasing access might resolve the conflict, or at least it's good to test
        storm.releaseAccess('task-1');
        // We'll just test that getConflictReport handles current conflicts correctly.
    });
});
