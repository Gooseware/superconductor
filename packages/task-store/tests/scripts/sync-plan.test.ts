import { describe, it, expect } from 'vitest';
import { normalizeTitle, processPlan } from '../../../../scripts/sync-plan.ts';

describe('normalizeTitle', () => {
    it('strips markdown bolding', () => {
        expect(normalizeTitle('**My Task**')).toBe('My Task');
        expect(normalizeTitle('*My Task*')).toBe('My Task');
    });

    it('strips trailing metadata', () => {
        expect(normalizeTitle('My Task [TIER-1]')).toBe('My Task');
        expect(normalizeTitle('My Task [AGENT:processor]')).toBe('My Task');
        expect(normalizeTitle('My Task [checkpoint:123]')).toBe('My Task');
        expect(normalizeTitle('My Task [TIER-2] [AGENT:test]')).toBe('My Task');
    });

    it('trims whitespace', () => {
        expect(normalizeTitle('  My Task  ')).toBe('My Task');
    });
});

describe('processPlan', () => {
    it('handles optional Task: prefix', () => {
        const content = '- [ ] Task: My Task\n- [ ] My Other Task';
        const tasks = [
            { title: 'My Task', status: 'completed' },
            { title: 'My Other Task', status: 'completed' }
        ];
        const result = processPlan(content, tasks);
        expect(result.updatedCount).toBe(2);
        expect(result.content).toBe('- [x] Task: My Task\n- [x] My Other Task');
    });

    it('handles markdown bolding in titles', () => {
        const content = '- [ ] **Bold Task**';
        const tasks = [
            { title: 'Bold Task', status: 'completed' }
        ];
        const result = processPlan(content, tasks);
        expect(result.updatedCount).toBe(1);
        expect(result.content).toBe('- [x] **Bold Task**');
    });

    it('ignores non-matching tasks', () => {
        const content = '- [ ] Some Task';
        const tasks = [
            { title: 'Other Task', status: 'completed' }
        ];
        const result = processPlan(content, tasks);
        expect(result.updatedCount).toBe(0);
        expect(result.content).toBe('- [ ] Some Task');
    });
    
    it('updates checkbox state [x] -> [ ] if not completed', () => {
        const content = '- [x] Some Task\n- [X] Task 2';
        const tasks = [
            { title: 'Some Task', status: 'pending' },
            { title: 'Task 2', status: 'in-progress' }
        ];
        const result = processPlan(content, tasks);
        expect(result.updatedCount).toBe(2);
        expect(result.content).toBe('- [ ] Some Task\n- [ ] Task 2');
    });

    it('does not touch checked tasks if completed', () => {
        const content = '- [x] Done Task';
        const tasks = [
            { title: 'Done Task', status: 'completed' }
        ];
        const result = processPlan(content, tasks);
        expect(result.updatedCount).toBe(0);
        expect(result.content).toBe('- [x] Done Task');
    });
});
