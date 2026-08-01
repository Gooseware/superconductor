import { describe, it, expect, vi } from 'vitest';
import { LanguageAdapter } from '../../src/swarm/LanguageAdapter';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('LanguageAdapter', () => {
    it('detects typescript', () => {
        vi.spyOn(fs, 'existsSync').mockImplementation((p: string) => p.includes('package.json'));
        vi.spyOn(fs, 'readFileSync').mockReturnValue('');
        
        const profile = LanguageAdapter.detectProfile('/test');
        expect(profile.testCommand).toBe('npm test');
    });

    it('detects python', () => {
        vi.spyOn(fs, 'existsSync').mockImplementation((p: string) => p.includes('requirements.txt'));
        vi.spyOn(fs, 'readFileSync').mockReturnValue('');
        
        const profile = LanguageAdapter.detectProfile('/test');
        expect(profile.testCommand).toBe('pytest');
    });
});
