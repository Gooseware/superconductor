import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TestTheatreDetector } from './test-theatre-detector.js';

describe('TestTheatreDetector', () => {
  let tmpDir: string;
  let detector: TestTheatreDetector;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-theatre-'));
    detector = new TestTheatreDetector();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects fireEvent.click with no expect', () => {
    const filePath = path.join(tmpDir, 'test-fire-event.test.ts');
    const content = `
      import { fireEvent } from '@testing-library/react';
      it('clicks button without assertions', () => {
        fireEvent.click(button);
      });
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    const findings = detector.scan(filePath);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: filePath,
      testName: 'clicks button without assertions',
      eventsFound: ['fireEvent.click'],
    });
    expect(findings[0].line).toBeGreaterThan(0);
  });

  it('detects userEvent.type with no expect', () => {
    const filePath = path.join(tmpDir, 'test-user-event.test.ts');
    const content = `
      import userEvent from '@testing-library/user-event';
      test('types input without expect', async () => {
        await userEvent.type(input, 'hello');
      });
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    const findings = detector.scan(filePath);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: filePath,
      testName: 'types input without expect',
      eventsFound: ['userEvent.type'],
    });
  });

  it('returns no finding for fireEvent.click with expect', () => {
    const filePath = path.join(tmpDir, 'test-with-expect.test.ts');
    const content = `
      import { fireEvent } from '@testing-library/react';
      it('clicks button with assertion', () => {
        fireEvent.click(button);
        expect(button).toBeDisabled();
      });
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    const findings = detector.scan(filePath);
    expect(findings).toHaveLength(0);
  });

  it('returns no finding when no events are called', () => {
    const filePath = path.join(tmpDir, 'test-no-events.test.ts');
    const content = `
      it('pure unit test', () => {
        const result = 1 + 1;
        expect(result).toBe(2);
      });
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    const findings = detector.scan(filePath);
    expect(findings).toHaveLength(0);
  });

  it('scanDirectory finds findings across multiple files and subdirectories', () => {
    const subDir = path.join(tmpDir, 'subdir');
    fs.mkdirSync(subDir);

    const file1 = path.join(tmpDir, 'file1.test.ts');
    const file2 = path.join(subDir, 'file2.test.ts');
    const file3 = path.join(tmpDir, 'file3.test.ts');
    const nonJsFile = path.join(tmpDir, 'notes.txt');

    fs.writeFileSync(file1, `
      it.only('bad test 1', () => {
        fireEvent.click(btn);
      });
    `, 'utf-8');

    fs.writeFileSync(file2, `
      test.skip('bad test 2', () => {
        dispatchEvent(new Event('change'));
      });
    `, 'utf-8');

    fs.writeFileSync(file3, `
      it('good test', () => {
        pointerEvent.down(el);
        expect(el).toBeDefined();
      });
    `, 'utf-8');

    fs.writeFileSync(nonJsFile, 'some text content', 'utf-8');

    const findings = detector.scanDirectory(tmpDir);
    expect(findings).toHaveLength(2);

    const testNames = findings.map(f => f.testName);
    expect(testNames).toContain('bad test 1');
    expect(testNames).toContain('bad test 2');
    expect(testNames).not.toContain('good test');
  });

  it('handles non-existent file or directory gracefully', () => {
    expect(detector.scan(path.join(tmpDir, 'non-existent.ts'))).toEqual([]);
    expect(detector.scan(tmpDir)).toEqual([]); // dir passed to scan
    expect(detector.scanDirectory(path.join(tmpDir, 'non-existent-dir'))).toEqual([]);
  });

  it('handles tests without callback or non-string names', () => {
    const filePath = path.join(tmpDir, 'edge.test.ts');
    const content = `
      it('test with no body');
      const nameVar = 'dynamic name';
      it(nameVar, () => {
        userEvent.click(btn);
      });
    `;
    fs.writeFileSync(filePath, content, 'utf-8');

    const findings = detector.scan(filePath);
    expect(findings).toHaveLength(1);
    expect(findings[0].testName).toBe('nameVar');
    expect(findings[0].eventsFound).toEqual(['userEvent.click']);
  });
});
