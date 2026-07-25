import { describe, it, expect } from 'vitest';
import { GenerateResearchPrompt, PackageVettingMatrixSchema } from '../../src/intelligence/prompt-generator.js';
import { DependencyContextManager, ManifestParser } from '../../src/intelligence/dependency-context.js';

class MockParser implements ManifestParser {
    parse(content: string): Record<string, string> {
        return { 'lodash': '^4.17.21' };
    }
    appliesTo(fileName: string): boolean {
        return fileName === 'package.json';
    }
}

class MockDependencyManager extends DependencyContextManager {
    getDependencies(workspaceDir: string): Record<string, string> {
        if (!workspaceDir) return {};
        return { 'react': '^18.0.0' };
    }
}

describe('Prompt Generator', () => {
    it('should generate a prompt with dependency context and read-only instructions', () => {
        const mockManager = new MockDependencyManager();
        const prompt = GenerateResearchPrompt('/fake/dir', 'Analyze the code.', mockManager);
        
        expect(prompt).toContain('Analyze the code.');
        expect(prompt).toContain('"react": "^18.0.0"');
        expect(prompt).toContain('read-only capacity');
    });
    
    it('should handle undefined or empty basePrompt gracefully', () => {
        const mockManager = new MockDependencyManager();
        const prompt = GenerateResearchPrompt('/fake/dir', undefined as any, mockManager);
        
        expect(prompt).toContain('Installed Packages');
        expect(prompt).toContain('read-only capacity');
    });

    it('should handle null/empty workspaceDir gracefully', () => {
        const mockManager = new MockDependencyManager();
        const prompt = GenerateResearchPrompt(null as any, 'Base prompt', mockManager);
        
        expect(prompt).toContain('Base prompt');
        expect(prompt).toContain('{}');
        expect(prompt).toContain('read-only capacity');
    });
});

describe('PackageVettingMatrixSchema', () => {
    it('should validate a valid matrix', () => {
        const validData = {
            licenseCompliance: true,
            cves: [],
            maintenanceMetrics: {
                lastCommit: '2023-01-01',
                openIssues: 10,
                contributors: 5
            },
            bundleSize: 1024
        };
        
        const result = PackageVettingMatrixSchema.safeParse(validData);
        expect(result.success).toBe(true);
    });

    it('should invalidate missing required fields', () => {
        const invalidData = {
            cves: []
        };
        
        const result = PackageVettingMatrixSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
    });
});
