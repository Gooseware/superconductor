import { describe, it, expect, vi } from 'vitest';
import { RemediatorPromptBuilder } from '../../src/swarm/RemediatorPromptBuilder';
import * as fs from 'fs';

vi.mock('fs');

describe('RemediatorPromptBuilder', () => {
    it('builds prompt', () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const builder = new RemediatorPromptBuilder();
        const prompt = builder.build({
            task: 'test task',
            scope: 'test scope',
            excluded: 'test excluded',
            pattern: 'test pattern',
            evidenceRequired: 'test evidence',
            definitionOfDone: 'test done'
        }, '/test', 'typescript');
        
        expect(prompt).toContain('TASK: test task');
        expect(prompt).toContain('ANTI_PATTERNS: Phantom Implementation: returning empty strings or null instead of actual implementation, Coverage Map Gaming: writing tests that just execute code without asserting logic, Test Theatre: testing mocked internal functions without integrating them');
    });
});
