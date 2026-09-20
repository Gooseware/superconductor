import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LanguageProfile, LanguageConfig } from './language-profile.js';

describe('LanguageProfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-profile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('forLanguage', () => {
    it('returns TypeScript / JavaScript profile for "TypeScript"', () => {
      const config = LanguageProfile.forLanguage('TypeScript');
      expect(config.primaryLanguage).toBe('TypeScript');
      expect(config.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
      expect(config.fileExtensions).toEqual(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
      expect(config.sourceGlobs).toEqual(['src/**', 'packages/**/src/**', 'lib/**']);
      expect(config.testFilePattern.test('foo.test.ts')).toBe(true);
      expect(config.testFilePattern.test('bar.spec.tsx')).toBe(true);
      expect(config.testFilePattern.test('baz.test.js')).toBe(true);
      expect(config.testFilePattern.test('qux.spec.jsx')).toBe(true);
      expect(config.testFilePattern.test('index.ts')).toBe(false);
      expect(config.testFilePattern.test('test.txt')).toBe(false);
    });

    it('returns TypeScript / JavaScript profile for "JavaScript" and aliases', () => {
      const configJs = LanguageProfile.forLanguage('JavaScript');
      expect(configJs.primaryLanguage).toBe('JavaScript');
      expect(configJs.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
      expect(configJs.fileExtensions).toEqual(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

      const configTs = LanguageProfile.forLanguage('ts');
      expect(configTs.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');

      const configJsAlias = LanguageProfile.forLanguage('js');
      expect(configJsAlias.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');

      const configCombined = LanguageProfile.forLanguage('TypeScript/JavaScript');
      expect(configCombined.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
    });

    it('returns Python profile for "Python"', () => {
      const config = LanguageProfile.forLanguage('Python');
      expect(config.primaryLanguage).toBe('Python');
      expect(config.ctagsLanguages).toBe('--languages=Python');
      expect(config.fileExtensions).toEqual(['.py']);
      expect(config.sourceGlobs).toEqual(['**/*.py']);
      expect(config.testFilePattern.test('test_auth.py')).toBe(true);
      expect(config.testFilePattern.test('auth_test.py')).toBe(true);
      expect(config.testFilePattern.test('auth.py')).toBe(false);

      const configAlias = LanguageProfile.forLanguage('py');
      expect(configAlias.primaryLanguage).toBe('Python');
    });

    it('returns Go profile for "Go"', () => {
      const config = LanguageProfile.forLanguage('Go');
      expect(config.primaryLanguage).toBe('Go');
      expect(config.ctagsLanguages).toBe('--languages=Go');
      expect(config.fileExtensions).toEqual(['.go']);
      expect(config.sourceGlobs).toEqual(['**/*.go']);
      expect(config.testFilePattern.test('service_test.go')).toBe(true);
      expect(config.testFilePattern.test('service.go')).toBe(false);
      expect(config.testFilePattern.test('test_service.go')).toBe(false);

      const configAlias = LanguageProfile.forLanguage('golang');
      expect(configAlias.primaryLanguage).toBe('Go');
    });

    it('returns Rust profile for "Rust"', () => {
      const config = LanguageProfile.forLanguage('Rust');
      expect(config.primaryLanguage).toBe('Rust');
      expect(config.ctagsLanguages).toBe('--languages=Rust');
      expect(config.fileExtensions).toEqual(['.rs']);
      expect(config.sourceGlobs).toEqual(['src/**/*.rs']);
      expect(config.testFilePattern.test('tests/integration.rs')).toBe(true);
      expect(config.testFilePattern.test('test/unit.rs')).toBe(true);
      expect(config.testFilePattern.test('module_test.rs')).toBe(true);
      expect(config.testFilePattern.test('src/main.rs')).toBe(false);

      const configAlias = LanguageProfile.forLanguage('rs');
      expect(configAlias.primaryLanguage).toBe('Rust');
    });

    it('returns C / C++ profile for "C" and "C++"', () => {
      const configC = LanguageProfile.forLanguage('C');
      expect(configC.primaryLanguage).toBe('C');
      expect(configC.ctagsLanguages).toBe('--languages=C,C++');
      expect(configC.fileExtensions).toEqual(['.c', '.cpp', '.cc', '.h', '.hpp']);
      expect(configC.sourceGlobs).toEqual(['src/**', 'include/**']);
      expect(configC.testFilePattern.test('test/test_main.c')).toBe(true);
      expect(configC.testFilePattern.test('tests/test_algo.cpp')).toBe(true);
      expect(configC.testFilePattern.test('test/runner.cc')).toBe(true);
      expect(configC.testFilePattern.test('src/main.c')).toBe(false);

      const configCpp = LanguageProfile.forLanguage('C++');
      expect(configCpp.primaryLanguage).toBe('C++');
      expect(configCpp.ctagsLanguages).toBe('--languages=C,C++');

      const configCppAlias = LanguageProfile.forLanguage('cpp');
      expect(configCppAlias.primaryLanguage).toBe('C++');
    });

    it('returns Java profile for "Java"', () => {
      const config = LanguageProfile.forLanguage('Java');
      expect(config.primaryLanguage).toBe('Java');
      expect(config.ctagsLanguages).toBe('--languages=Java');
      expect(config.fileExtensions).toEqual(['.java']);
      expect(config.sourceGlobs).toEqual(['src/main/java/**', 'src/test/java/**']);
      expect(config.testFilePattern.test('TestOrderService.java')).toBe(true);
      expect(config.testFilePattern.test('OrderServiceTest.java')).toBe(true);
      expect(config.testFilePattern.test('OrderService.java')).toBe(false);
    });

    it('returns safe fallback (TypeScript/JavaScript) for unknown languages', () => {
      const configUnknown = LanguageProfile.forLanguage('Brainfuck');
      expect(configUnknown.primaryLanguage).toBe('TypeScript');
      expect(configUnknown.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
      expect(configUnknown.fileExtensions).toEqual(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

      const configEmpty = LanguageProfile.forLanguage('');
      expect(configEmpty.primaryLanguage).toBe('TypeScript');

      const configNull = LanguageProfile.forLanguage(null as any);
      expect(configNull.primaryLanguage).toBe('TypeScript');
    });

    it('returns isolated copies of array properties to prevent mutation', () => {
      const c1 = LanguageProfile.forLanguage('Python');
      c1.fileExtensions.push('.pyi');
      c1.sourceGlobs.push('scripts/**');

      const c2 = LanguageProfile.forLanguage('Python');
      expect(c2.fileExtensions).toEqual(['.py']);
      expect(c2.sourceGlobs).toEqual(['**/*.py']);
    });
  });

  describe('fromFingerprint', () => {
    it('reads 01_fingerprint.json from output directory and returns config', () => {
      fs.writeFileSync(
        path.join(tmpDir, '01_fingerprint.json'),
        JSON.stringify({
          languages: { Python: 500 },
          totalLines: 500,
          totalFiles: 5,
          primaryLanguage: 'Python',
        }),
        'utf8'
      );

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('Python');
      expect(config.ctagsLanguages).toBe('--languages=Python');
      expect(config.fileExtensions).toEqual(['.py']);
    });

    it('handles direct file path to 01_fingerprint.json', () => {
      const filePath = path.join(tmpDir, '01_fingerprint.json');
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          languages: { Rust: 1200 },
          totalLines: 1200,
          totalFiles: 10,
          primaryLanguage: 'Rust',
        }),
        'utf8'
      );

      const config = LanguageProfile.fromFingerprint(filePath);
      expect(config.primaryLanguage).toBe('Rust');
      expect(config.ctagsLanguages).toBe('--languages=Rust');
    });

    it('handles case-insensitive primaryLanguage in fingerprint', () => {
      fs.writeFileSync(
        path.join(tmpDir, '01_fingerprint.json'),
        JSON.stringify({
          primaryLanguage: 'gOLaNg',
        }),
        'utf8'
      );

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('Go');
      expect(config.ctagsLanguages).toBe('--languages=Go');
    });

    it('falls back to TypeScript when file does not exist', () => {
      const nonExistentDir = path.join(tmpDir, 'does-not-exist');
      const config = LanguageProfile.fromFingerprint(nonExistentDir);
      expect(config.primaryLanguage).toBe('TypeScript');
      expect(config.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
    });

    it('falls back to TypeScript when fingerprint file is malformed JSON', () => {
      fs.writeFileSync(path.join(tmpDir, '01_fingerprint.json'), 'INVALID JSON {{{{', 'utf8');

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('TypeScript');
      expect(config.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
    });

    it('falls back to TypeScript when fingerprint file is null JSON', () => {
      fs.writeFileSync(path.join(tmpDir, '01_fingerprint.json'), 'null', 'utf8');

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('TypeScript');
      expect(config.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
    });

    it('falls back to TypeScript when primaryLanguage is null or empty', () => {
      fs.writeFileSync(
        path.join(tmpDir, '01_fingerprint.json'),
        JSON.stringify({ primaryLanguage: null }),
        'utf8'
      );

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('TypeScript');

      fs.writeFileSync(
        path.join(tmpDir, '01_fingerprint.json'),
        JSON.stringify({ primaryLanguage: '' }),
        'utf8'
      );

      const config2 = LanguageProfile.fromFingerprint(tmpDir);
      expect(config2.primaryLanguage).toBe('TypeScript');
    });

    it('falls back to TypeScript when primaryLanguage is an unsupported language', () => {
      fs.writeFileSync(
        path.join(tmpDir, '01_fingerprint.json'),
        JSON.stringify({ primaryLanguage: 'Fortran' }),
        'utf8'
      );

      const config = LanguageProfile.fromFingerprint(tmpDir);
      expect(config.primaryLanguage).toBe('TypeScript');
      expect(config.ctagsLanguages).toBe('--languages=TypeScript,JavaScript');
    });

    it('handles empty or invalid outputDir argument gracefully', () => {
      expect(LanguageProfile.fromFingerprint('').primaryLanguage).toBe('TypeScript');
      expect(LanguageProfile.fromFingerprint(null as any).primaryLanguage).toBe('TypeScript');
      expect(LanguageProfile.fromFingerprint(undefined as any).primaryLanguage).toBe('TypeScript');
    });
  });

  describe('LanguageProfile class instantiation', () => {
    it('creates an instance satisfying LanguageConfig and instanceof', () => {
      const rawConfig: LanguageConfig = {
        primaryLanguage: 'Go',
        ctagsLanguages: '--languages=Go',
        fileExtensions: ['.go'],
        testFilePattern: /_test\.go$/,
        sourceGlobs: ['**/*.go'],
      };
      const instance = new LanguageProfile(rawConfig);
      expect(instance).toBeInstanceOf(LanguageProfile);
      expect(instance.primaryLanguage).toBe('Go');
      expect(instance.ctagsLanguages).toBe('--languages=Go');
      expect(instance.fileExtensions).toEqual(['.go']);
      expect(instance.testFilePattern).toEqual(/_test\.go$/);
      expect(instance.sourceGlobs).toEqual(['**/*.go']);
    });
  });

  describe('module exports', () => {
    it('is exported properly from intelligence/index.js', async () => {
      const intelligence = await import('../index.js');
      expect(intelligence.LanguageProfile).toBe(LanguageProfile);
    }, { timeout: 20000 });
  });
});

