import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { LanguageAdapter } from '../../src/swarm/LanguageAdapter.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('LanguageAdapter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-adapter-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect typescript from tech stack profile', () => {
    const profile = LanguageAdapter.getProfile('typescript');
    expect(profile.language).toBe('typescript');
    expect(profile.testCommand).toBe('npm test');
  });

  it('should return unknown for unknown language', () => {
    const profile = LanguageAdapter.getProfile('unknown');
    expect(profile.language).toBe('unknown');
  });

  it('should detect go when passed explicitly as parameter', () => {
    const profile = LanguageAdapter.detect(tempDir, 'go');
    expect(profile.language).toBe('go');
    expect(profile.testCommand).toBe('go test ./...');
  });

  it('should detect go from tech-stack.md containing golang', () => {
    fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'Primary language: Golang\nBackend service.');
    const profile = LanguageAdapter.detect(tempDir);
    expect(profile.language).toBe('go');
  });

  it('should detect go from tech-stack.md containing go 1.21', () => {
    fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'Built with go 1.21 and gRPC');
    const profile = LanguageAdapter.detect(tempDir);
    expect(profile.language).toBe('go');
  });

  it('should detect go from tech-stack.md containing language: go', () => {
    fs.writeFileSync(path.join(tempDir, 'tech-stack.md'), 'language: go\nframework: gin');
    const profile = LanguageAdapter.detect(tempDir);
    expect(profile.language).toBe('go');
  });

  it('should detect go from manifest fallback go.mod', () => {
    fs.writeFileSync(path.join(tempDir, 'go.mod'), 'module example.com/my/project\n\ngo 1.20');
    const profile = LanguageAdapter.detect(tempDir);
    expect(profile.language).toBe('go');
  });
});
