import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAudit } from '../../scripts/audit-swarm-compliance';
import * as child_process from 'child_process';
import * as fs from 'fs';

vi.mock('child_process');
vi.mock('fs');

describe('audit-swarm-compliance', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly identifies compliant commits', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd: string | Buffer | URL) => {
      const command = cmd.toString();
      if (command.includes('-- "packages/*/src/**"')) {
        return 'hash123\n';
      }
      if (command.includes('format="%B" hash123')) {
        return 'feat: some feature\n\nSwarm-Authorized: true\n';
      }
      if (command.includes('rev-parse --show-toplevel')) {
        return '/repo/root\n';
      }
      return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    runAudit();

    expect(consoleSpy).toHaveBeenCalledWith('Analyzed 1 commits touching packages/*/src/');
    expect(consoleSpy).toHaveBeenCalledWith('Compliant commits: 1');
    expect(consoleSpy).toHaveBeenCalledWith('\nNo violations found.');
    expect(consoleSpy).toHaveBeenCalledWith('\nNo bypass events logged.');
  });

  it('correctly flags non-compliant commits', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd: string | Buffer | URL) => {
      const command = cmd.toString();
      if (command.includes('-- "packages/*/src/**"')) {
        return 'hash123\nhash456\n';
      }
      if (command.includes('format="%B" hash123')) {
        return 'feat: some feature\n\nSwarm-Authorized: true\n';
      }
      if (command.includes('format="%B" hash456')) {
        return 'fix: some bug without authorization\n';
      }
      if (command.includes('format="%s" hash456')) {
        return 'fix: some bug without authorization\n';
      }
      if (command.includes('rev-parse --show-toplevel')) {
        return '/repo/root\n';
      }
      return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    runAudit();

    expect(consoleSpy).toHaveBeenCalledWith('Analyzed 2 commits touching packages/*/src/');
    expect(consoleSpy).toHaveBeenCalledWith('Compliant commits: 1');
    expect(consoleSpy).toHaveBeenCalledWith('\nViolations found (1):');
    expect(consoleSpy).toHaveBeenCalledWith('- hash456: fix: some bug without authorization');
  });

  it('correctly surfaces bypass log entries', () => {
    vi.mocked(child_process.execSync).mockImplementation((cmd: string | Buffer | URL) => {
      const command = cmd.toString();
      if (command.includes('-- "packages/*/src/**"')) {
        return '';
      }
      if (command.includes('rev-parse --show-toplevel')) {
        return '/repo/root\n';
      }
      return '';
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('2026-07-25: Emergency bypass by dev123');

    runAudit();

    expect(consoleSpy).toHaveBeenCalledWith('\n--- Bypass Events (Needs Human Review) ---');
    expect(consoleSpy).toHaveBeenCalledWith('2026-07-25: Emergency bypass by dev123');
  });
});
