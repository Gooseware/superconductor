import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

describe('hook-enforcement', () => {
  let tempRepo: string;
  let preCommitScript: string;
  let installScript: string;

  beforeEach(() => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'superconductor-hook-test-'));
    
    // Init git repo
    execSync('git init', { cwd: tempRepo });
    execSync('git config user.name "Test User"', { cwd: tempRepo });
    execSync('git config user.email "test@example.com"', { cwd: tempRepo });
    execSync('git commit --allow-empty -m "initial commit"', { cwd: tempRepo });

    fs.mkdirSync(path.join(tempRepo, 'superconductor'));
    fs.mkdirSync(path.join(tempRepo, 'packages', 'core', 'src'), { recursive: true });
    
    const workspaceRoot = path.resolve(__dirname, '../../');
    preCommitScript = path.join(workspaceRoot, 'scripts', 'hooks', 'pre-commit');
    installScript = path.join(workspaceRoot, 'scripts', 'hooks', 'install-hooks.sh');
  });

  afterEach(() => {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  });

  describe('pre-commit hook logic', () => {
    it('should exit 0 if no active track found', () => {
      fs.writeFileSync(path.join(tempRepo, 'superconductor', 'tracks.md'), '- [ ] Inactive track\n');
      
      // Stage a src file
      fs.writeFileSync(path.join(tempRepo, 'packages', 'core', 'src', 'index.ts'), 'console.log("hello");');
      execSync('git add .', { cwd: tempRepo });
      
      const stdout = execSync(preCommitScript, { cwd: tempRepo }).toString();
      expect(stdout).toBe('');
    });

    it('should exit 0 if active track found but no src/ files staged', () => {
      fs.writeFileSync(path.join(tempRepo, 'superconductor', 'tracks.md'), '- [~] Active track\n');
      
      // Stage a non-src file
      fs.writeFileSync(path.join(tempRepo, 'README.md'), 'updated');
      execSync('git add README.md', { cwd: tempRepo });
      
      const stdout = execSync(preCommitScript, { cwd: tempRepo }).toString();
      expect(stdout).toBe('');
    });

    it('should exit 0 if active track found, src/ files staged, and Swarm-Authorized present', () => {
      fs.writeFileSync(path.join(tempRepo, 'superconductor', 'tracks.md'), '- [~] Active track\n');
      
      fs.writeFileSync(path.join(tempRepo, 'packages', 'core', 'src', 'index.ts'), 'console.log("hello");');
      execSync('git add .', { cwd: tempRepo });
      
      // Create COMMIT_EDITMSG
      const gitDir = execSync('git rev-parse --git-dir', { cwd: tempRepo }).toString().trim();
      fs.writeFileSync(path.join(tempRepo, gitDir, 'COMMIT_EDITMSG'), 'feat: update\n\nSwarm-Authorized: true\n');
      
      const stdout = execSync(preCommitScript, { cwd: tempRepo }).toString();
      expect(stdout).toBe('');
    });

    it('should exit 1 if active track found, src/ files staged, and Swarm-Authorized missing', () => {
      fs.writeFileSync(path.join(tempRepo, 'superconductor', 'tracks.md'), '- [~] Active track\n');
      
      fs.writeFileSync(path.join(tempRepo, 'packages', 'core', 'src', 'index.ts'), 'console.log("hello");');
      execSync('git add .', { cwd: tempRepo });
      
      // No COMMIT_EDITMSG or without Swarm-Authorized
      let error: any;
      try {
        execSync(preCommitScript, { cwd: tempRepo, stdio: 'pipe' });
      } catch (err) {
        error = err;
      }
      
      expect(error).toBeDefined();
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('Commit blocked: active track detected and src/ changes require Swarm Authorization');
    });

    it('should exit 0 and log bypass if bypass var is set', () => {
      fs.writeFileSync(path.join(tempRepo, 'superconductor', 'tracks.md'), '- [~] Active track\n');
      
      fs.writeFileSync(path.join(tempRepo, 'packages', 'core', 'src', 'index.ts'), 'console.log("hello");');
      execSync('git add .', { cwd: tempRepo });
      
      execSync(preCommitScript, { 
        cwd: tempRepo, 
        env: { ...process.env, SUPERCONDUCTOR_BYPASS: '1', SUPERCONDUCTOR_BYPASS_REASON: 'emergency fix' }
      });
      
      const logContent = fs.readFileSync(path.join(tempRepo, 'superconductor', 'swarm_compliance.log'), 'utf8');
      expect(logContent).toContain('Bypass by Test User');
      expect(logContent).toContain('Reason: emergency fix');
      expect(logContent).toContain('packages/core/src/index.ts');
    });
  });

  describe('install-hooks.sh', () => {
    it('should install hook and be idempotent', () => {
      // Create a mocked version of install-hooks.sh since it uses $(git rev-parse --show-toplevel) 
      // which would point to the real repo, not our temp repo, if we run it directly.
      // We will patch the SOURCE_HOOK line.
      const scriptContent = fs.readFileSync(installScript, 'utf8');
      const patchedContent = scriptContent.replace(
        'SOURCE_HOOK="$(git rev-parse --show-toplevel)/scripts/hooks/pre-commit"',
        `SOURCE_HOOK="${preCommitScript}"`
      );
      
      const patchedScriptPath = path.join(tempRepo, 'install-hooks.sh');
      fs.writeFileSync(patchedScriptPath, patchedContent);
      fs.chmodSync(patchedScriptPath, '755');

      const hookPath = path.join(tempRepo, '.git', 'hooks', 'pre-commit');

      // First install
      execSync(patchedScriptPath, { cwd: tempRepo });
      expect(fs.existsSync(hookPath)).toBe(true);
      
      // Verify executable bit
      const stat = fs.statSync(hookPath);
      expect((stat.mode & fs.constants.S_IXUSR) !== 0).toBe(true);

      // Second install - should be idempotent
      const output = execSync(patchedScriptPath, { cwd: tempRepo }).toString();
      expect(output).toContain('already installed');
    });
  });
});
