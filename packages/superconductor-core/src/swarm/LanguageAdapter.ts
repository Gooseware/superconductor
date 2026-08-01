import * as fs from 'fs';
import * as path from 'path';

export interface LanguageProfile {
    testCommand: string;
    manifestFiles: string[];
    generatedDirs: string[];
    testTheatreAntiPatterns: string[];
    siblingsWithTests(): boolean;
}

export class LanguageAdapter {
    static detectProfile(workspacePath: string): LanguageProfile {
        const techStackPath = path.join(workspacePath, 'superconductor', 'tech-stack.md');
        let techStackContent = '';
        if (fs.existsSync(techStackPath)) {
            techStackContent = fs.readFileSync(techStackPath, 'utf8').toLowerCase();
        }

        const isTs = techStackContent.includes('typescript') || fs.existsSync(path.join(workspacePath, 'package.json')) || fs.existsSync(path.join(workspacePath, 'tsconfig.json'));
        const isPython = techStackContent.includes('python') || fs.existsSync(path.join(workspacePath, 'requirements.txt')) || fs.existsSync(path.join(workspacePath, 'pyproject.toml'));
        
        if (isTs) {
            return {
                testCommand: 'npm test',
                manifestFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
                generatedDirs: ['dist', 'build', 'node_modules'],
                testTheatreAntiPatterns: ['describe.skip', 'it.skip', 'expect(true).toBe(true)', 'xdescribe', 'xit'],
                siblingsWithTests: () => true
            };
        } else if (isPython) {
            return {
                testCommand: 'pytest',
                manifestFiles: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
                generatedDirs: ['__pycache__', 'dist', 'build', '.pytest_cache'],
                testTheatreAntiPatterns: ['@pytest.mark.skip', 'assert True', 'pass'],
                siblingsWithTests: () => true
            };
        }
        
        return {
            testCommand: 'make test',
            manifestFiles: [],
            generatedDirs: [],
            testTheatreAntiPatterns: [],
            siblingsWithTests: () => false
        };
    }
}
