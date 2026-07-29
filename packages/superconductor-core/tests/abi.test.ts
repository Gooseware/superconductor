import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { ABIPostMortem, ABI, ABIReport } from '../src/review/abi';

vi.mock('fs');
vi.mock('child_process');

describe('ABIPostMortem', () => {
  it('should parse swarm_log and return empty tweaks if no critical/retries found', () => {
    const log = `
      All good here.
      ADVISORY: Use better variable names.
    `;
    const report = ABIPostMortem.analyzeSwarmLog(log);
    
    expect(report.retryCount).toBe(0);
    expect(report.criticalFindings.length).toBe(0);
    expect(report.advisoryFindings).toEqual(['Use better variable names.']);
    expect(report.primaryTweak).toBeNull();
    expect(report.candidateTweaks.length).toBe(0);
  });

  it('should produce primary and secondary tweaks on CRITICAL findings or retries', () => {
    const log = `
      CRITICAL: Unhandled exception in main loop.
      Attempt 1 failed, retry.
      ADVISORY: Refactor this block.
    `;
    const report = ABIPostMortem.analyzeSwarmLog(log);

    expect(report.retryCount).toBe(1);
    expect(report.criticalFindings).toEqual(['Unhandled exception in main loop.']);
    expect(report.advisoryFindings).toEqual(['Refactor this block.']);
    
    expect(report.primaryTweak).not.toBeNull();
    expect(report.primaryTweak?.filename).toBe('coding-agent/SKILL.md');
    // Candidate tweaks assertion removed as per H-1 dynamic tweaks
  });
});

describe('ABI.applySkillTweak', () => {
  const homeDir = '/mock/home';
  const scDir = path.join(homeDir, '.superconductor');
  const skillsDir = path.join(scDir, 'skills');
  const targetFile = path.join(skillsDir, 'coding-agent/SKILL.md');
  const tempFileRegex = /coding-agent\/SKILL\.md\.tmp\.\d+/;

  const sampleReport: ABIReport = {
    retryCount: 1,
    criticalFindings: [],
    advisoryFindings: [],
    candidateTweaks: [
      { filename: 'security-reviewer/SKILL.md', description: 'desc', search: 'A', replace: 'B' }
    ],
    primaryTweak: {
      filename: 'coding-agent/SKILL.md',
      description: 'Test tweak',
      search: 'Write the implementation.',
      replace: 'Write the implementation. ENSURE NO CRITICAL REGRESSIONS.'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do nothing if no primary tweak is provided', () => {
    ABI.applySkillTweak({ ...sampleReport, primaryTweak: null }, homeDir);
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should throw if target file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => ABI.applySkillTweak(sampleReport, homeDir)).toThrow(/Target skill file not found/);
  });

  it('should be idempotent (do nothing if already applied)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // return content that already has the replacement
    vi.mocked(fs.readFileSync).mockReturnValue('Write the implementation. ENSURE NO CRITICAL REGRESSIONS.');

    ABI.applySkillTweak(sampleReport, homeDir);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should be idempotent (do nothing if search string not found)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // return content that doesn't have the search string
    vi.mocked(fs.readFileSync).mockReturnValue('Do something else entirely.');

    ABI.applySkillTweak(sampleReport, homeDir);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should apply tweak atomically and commit to git', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === targetFile) return true;
      if (p === path.join(scDir, '.git')) return true; // mock .git exists
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('Hello. Write the implementation. Goodbye.');

    ABI.applySkillTweak(sampleReport, homeDir);

    // Verify atomic write
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const writeArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(writeArgs[0]).toMatch(tempFileRegex);
    expect(writeArgs[1]).toBe('Hello. Write the implementation. ENSURE NO CRITICAL REGRESSIONS. Goodbye.');

    expect(fs.renameSync).toHaveBeenCalledTimes(1);
    const renameArgs = vi.mocked(fs.renameSync).mock.calls[0];
    expect(renameArgs[0]).toMatch(tempFileRegex);
    expect(renameArgs[1]).toBe(targetFile);

    // Verify git commands
    expect(child_process.execFileSync).toHaveBeenCalledTimes(2);
    expect(child_process.execFileSync).toHaveBeenNthCalledWith(1, 'git', ['add', targetFile], expect.any(Object));
    
    const commitCall = vi.mocked(child_process.execFileSync).mock.calls[1];
    expect(commitCall[1]).toContain('-m');
    expect(commitCall[1][2]).toContain('abi(skill/SKILL.md): Test tweak');
  });

  it('should handle partial failure (git exec failure) but still write file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Hello. Write the implementation. Goodbye.');
    
    vi.mocked(child_process.execFileSync).mockImplementation(() => {
      throw new Error('Git command failed');
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    ABI.applySkillTweak(sampleReport, homeDir);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1); // the file was still written
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('partial failure recovery'), expect.any(String));

    consoleWarnSpy.mockRestore();
  });
});
