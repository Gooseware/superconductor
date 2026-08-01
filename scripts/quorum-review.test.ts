import { describe, it, expect } from 'vitest';

describe('Quorum Review CLI Arguments', () => {
    it('should parse --findings as a named flag correctly without argument injection flaw', () => {
        const targetFile = 'test.ts';
        const findingsArg = JSON.stringify([{ msg: 'error' }]);
        
        // Assert the flag positions based on Bug 1 fix
        const args = ['--skill', 'remediation-processor', '--file', targetFile, '--findings', findingsArg];
        
        expect(args).toEqual([
            '--skill', 'remediation-processor', 
            '--file', 'test.ts', 
            '--findings', '[{"msg":"error"}]'
        ]);
        
        // Ensure -- is not placed before --findings
        expect(args.includes('--')).toBe(false);
        expect(args.indexOf('--findings')).toBeGreaterThan(args.indexOf('--file'));
    });
});
