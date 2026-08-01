import * as fs from 'fs';
import * as path from 'path';

export interface LanguageProfile {
  language: string;
  testCommand: string;
  manifestFiles: string[];
  generatedDirs: string[];
  testTheatreAntiPatterns: string[];
  siblingsWithTests: () => boolean;
}

export class LanguageAdapter {
  static detect(projectRoot: string, techStack?: string): LanguageProfile {
    let techStackContent = '';
    const techStackPath = path.join(projectRoot, 'tech-stack.md');
    
    if (fs.existsSync(techStackPath)) {
      techStackContent = fs.readFileSync(techStackPath, 'utf8').toLowerCase();
    }
    
    const hasTechStack = techStackContent.length > 0;
    
    if (hasTechStack && techStackContent.includes('typescript') || techStack === 'ts' || techStack === 'typescript') {
      return this.getProfile('typescript');
    }
    if (hasTechStack && techStackContent.includes('python') || techStack === 'python') {
      return this.getProfile('python');
    }
    if (hasTechStack && techStackContent.includes('go') || techStack === 'go') {
      return this.getProfile('go');
    }
    if (hasTechStack && techStackContent.includes('rust') || techStack === 'rust') {
      return this.getProfile('rust');
    }

    // Manifest fallback
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
      return this.getProfile('typescript');
    }
    if (fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
      return this.getProfile('python');
    }
    if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
      return this.getProfile('go');
    }
    if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
      return this.getProfile('rust');
    }

    console.warn('Unknown language, using generic fallback profile.');
    return this.getProfile('unknown');
  }

  static getProfile(language: string): LanguageProfile {
    switch (language) {
      case 'typescript':
      case 'ts':
        return {
          language: 'typescript',
          testCommand: 'npm test',
          manifestFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
          generatedDirs: ['node_modules', 'dist', 'build', 'out'],
          testTheatreAntiPatterns: ['echo "no tests yet"', 'exit 0'],
          siblingsWithTests: () => true
        };
      case 'python':
        return {
          language: 'python',
          testCommand: 'pytest',
          manifestFiles: ['pyproject.toml', 'requirements.txt', 'Pipfile', 'poetry.lock'],
          generatedDirs: ['__pycache__', 'venv', '.env', '.venv', 'dist', 'build'],
          testTheatreAntiPatterns: ['def test_.*():\\s*pass'],
          siblingsWithTests: () => true
        };
      case 'go':
        return {
          language: 'go',
          testCommand: 'go test ./...',
          manifestFiles: ['go.mod', 'go.sum'],
          generatedDirs: ['vendor', 'bin'],
          testTheatreAntiPatterns: ['t.Skip()'],
          siblingsWithTests: () => true
        };
      case 'rust':
        return {
          language: 'rust',
          testCommand: 'cargo test',
          manifestFiles: ['Cargo.toml', 'Cargo.lock'],
          generatedDirs: ['target'],
          testTheatreAntiPatterns: ['todo!()'],
          siblingsWithTests: () => true
        };
      default:
        return {
          language: 'unknown',
          testCommand: 'make test',
          manifestFiles: [],
          generatedDirs: [],
          testTheatreAntiPatterns: [],
          siblingsWithTests: () => false
        };
    }
  }
}
