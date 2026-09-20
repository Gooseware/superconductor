import * as fs from 'fs';
import * as path from 'path';

export interface LanguageConfig {
  primaryLanguage: string;
  ctagsLanguages: string;
  fileExtensions: string[];
  testFilePattern: RegExp;
  sourceGlobs: string[];
}

export class LanguageProfile implements LanguageConfig {
  readonly primaryLanguage: string;
  readonly ctagsLanguages: string;
  readonly fileExtensions: string[];
  readonly testFilePattern: RegExp;
  readonly sourceGlobs: string[];

  constructor(config: LanguageConfig) {
    this.primaryLanguage = config.primaryLanguage;
    this.ctagsLanguages = config.ctagsLanguages;
    this.fileExtensions = [...config.fileExtensions];
    this.testFilePattern = config.testFilePattern;
    this.sourceGlobs = [...config.sourceGlobs];
  }

  static forLanguage(language?: string | null): LanguageConfig {
    if (!language || typeof language !== 'string') {
      return LanguageProfile.createDefault();
    }

    const normalized = language.trim().toLowerCase();

    switch (normalized) {
      case 'typescript':
      case 'ts':
        return new LanguageProfile({
          primaryLanguage: 'TypeScript',
          ctagsLanguages: '--languages=TypeScript,JavaScript',
          fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
          testFilePattern: /\.(test|spec)\.[tj]sx?$/,
          sourceGlobs: ['src/**', 'packages/**/src/**', 'lib/**'],
        });

      case 'javascript':
      case 'js':
        return new LanguageProfile({
          primaryLanguage: 'JavaScript',
          ctagsLanguages: '--languages=TypeScript,JavaScript',
          fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
          testFilePattern: /\.(test|spec)\.[tj]sx?$/,
          sourceGlobs: ['src/**', 'packages/**/src/**', 'lib/**'],
        });

      case 'typescript/javascript':
      case 'javascript/typescript':
        return new LanguageProfile({
          primaryLanguage: 'TypeScript',
          ctagsLanguages: '--languages=TypeScript,JavaScript',
          fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
          testFilePattern: /\.(test|spec)\.[tj]sx?$/,
          sourceGlobs: ['src/**', 'packages/**/src/**', 'lib/**'],
        });

      case 'python':
      case 'py':
        return new LanguageProfile({
          primaryLanguage: 'Python',
          ctagsLanguages: '--languages=Python',
          fileExtensions: ['.py'],
          testFilePattern: /test_.*\.py$|_test\.py$/,
          sourceGlobs: ['**/*.py'],
        });

      case 'go':
      case 'golang':
        return new LanguageProfile({
          primaryLanguage: 'Go',
          ctagsLanguages: '--languages=Go',
          fileExtensions: ['.go'],
          testFilePattern: /_test\.go$/,
          sourceGlobs: ['**/*.go'],
        });

      case 'rust':
      case 'rs':
        return new LanguageProfile({
          primaryLanguage: 'Rust',
          ctagsLanguages: '--languages=Rust',
          fileExtensions: ['.rs'],
          testFilePattern: /(tests?\/.*\.rs$|_test\.rs$)/,
          sourceGlobs: ['src/**/*.rs'],
        });

      case 'c':
        return new LanguageProfile({
          primaryLanguage: 'C',
          ctagsLanguages: '--languages=C,C++',
          fileExtensions: ['.c', '.cpp', '.cc', '.h', '.hpp'],
          testFilePattern: /(test|tests)\/.*\.(c|cpp|cc)$/,
          sourceGlobs: ['src/**', 'include/**'],
        });

      case 'c++':
      case 'cpp':
      case 'cplusplus':
      case 'cc':
      case 'cxx':
      case 'c/c++':
      case 'c / c++':
        return new LanguageProfile({
          primaryLanguage: 'C++',
          ctagsLanguages: '--languages=C,C++',
          fileExtensions: ['.c', '.cpp', '.cc', '.h', '.hpp'],
          testFilePattern: /(test|tests)\/.*\.(c|cpp|cc)$/,
          sourceGlobs: ['src/**', 'include/**'],
        });

      case 'java':
        return new LanguageProfile({
          primaryLanguage: 'Java',
          ctagsLanguages: '--languages=Java',
          fileExtensions: ['.java'],
          testFilePattern: /Test.*\.java$|.*Test\.java$/,
          sourceGlobs: ['src/main/java/**', 'src/test/java/**'],
        });

      default:
        return LanguageProfile.createDefault();
    }
  }

  private static createDefault(): LanguageConfig {
    return new LanguageProfile({
      primaryLanguage: 'TypeScript',
      ctagsLanguages: '--languages=TypeScript,JavaScript',
      fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
      testFilePattern: /\.(test|spec)\.[tj]sx?$/,
      sourceGlobs: ['src/**', 'packages/**/src/**', 'lib/**'],
    });
  }

  static fromFingerprint(outputDir: string): LanguageConfig {
    if (!outputDir || typeof outputDir !== 'string') {
      return LanguageProfile.createDefault();
    }

    try {
      const filePath = outputDir.endsWith('01_fingerprint.json')
        ? outputDir
        : path.join(outputDir, '01_fingerprint.json');

      if (!fs.existsSync(filePath)) {
        return LanguageProfile.createDefault();
      }

      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') {
        return LanguageProfile.createDefault();
      }

      const rawLang = data.primaryLanguage;
      if (typeof rawLang !== 'string' || !rawLang.trim()) {
        return LanguageProfile.createDefault();
      }

      return LanguageProfile.forLanguage(rawLang);
    } catch {
      return LanguageProfile.createDefault();
    }
  }
}
