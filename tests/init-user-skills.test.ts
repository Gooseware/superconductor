import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

describe('init-user-skills.sh', () => {
  let tempHome: string;
  let tempPluginDir: string;
  let scriptPath: string;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superconductor-test-'));
    tempPluginDir = path.join(tempHome, 'plugin', 'skills');
    fs.mkdirSync(tempPluginDir, { recursive: true });
    
    // Create dummy plugin skills
    ['security-reviewer', 'correctness-reviewer', 'adversarial-reviewer', 'coding-agent'].forEach(skill => {
      fs.mkdirSync(path.join(tempPluginDir, skill));
      fs.writeFileSync(path.join(tempPluginDir, skill, 'SKILL.md'), `# ${skill}\n`);
    });

    scriptPath = path.resolve(__dirname, '../scripts/init-user-skills.sh');
    
    // We need to patch the script to use our temp dirs for testing, 
    // or just run the logic directly. The easiest way to test a bash script 
    // is to run it with HOME mocked.
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('should initialize a git repo and copy skills if they do not exist', () => {
    // Run script with mocked HOME
    // We also need to mock PLUGIN_SKILLS_DIR which is derived from $0 in the script.
    // Instead of running the script directly, we can test it by running it in a subshell 
    // but the script uses $(dirname "$0")/../skills.
    // We can copy the script to our temp dir and modify it.
    
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    const patchedContent = scriptContent.replace(
      'PLUGIN_SKILLS_DIR="$(cd "$(dirname "$0")/../skills" && pwd)"',
      `PLUGIN_SKILLS_DIR="${tempPluginDir}"`
    );
    const patchedScriptPath = path.join(tempHome, 'init-user-skills.sh');
    fs.writeFileSync(patchedScriptPath, patchedContent);
    fs.chmodSync(patchedScriptPath, '755');

    execSync(patchedScriptPath, { env: { ...process.env, HOME: tempHome, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });

    const userSkillsDir = path.join(tempHome, '.superconductor', 'skills');
    expect(fs.existsSync(userSkillsDir)).toBe(true);
    expect(fs.existsSync(path.join(tempHome, '.superconductor', '.git'))).toBe(true);
    
    ['security-reviewer', 'correctness-reviewer', 'adversarial-reviewer', 'coding-agent'].forEach(skill => {
      expect(fs.existsSync(path.join(userSkillsDir, skill, 'SKILL.md'))).toBe(true);
    });

    // Check if git commit exists
    const log = execSync('git log --oneline', { cwd: path.join(tempHome, '.superconductor') }).toString();
    expect(log).toContain('seed user skill directory');
  });

  it('should be idempotent and not commit if no changes are made', () => {
    const patchedScriptPath = path.join(tempHome, 'init-user-skills.sh');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    fs.writeFileSync(patchedScriptPath, scriptContent.replace(
      'PLUGIN_SKILLS_DIR="$(cd "$(dirname "$0")/../skills" && pwd)"',
      `PLUGIN_SKILLS_DIR="${tempPluginDir}"`
    ));
    fs.chmodSync(patchedScriptPath, '755');

    // Run first time
    execSync(patchedScriptPath, { env: { ...process.env, HOME: tempHome, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const log1 = execSync('git log --oneline', { cwd: path.join(tempHome, '.superconductor') }).toString();
    const commitCount1 = log1.split('\n').filter(Boolean).length;

    // Run second time
    execSync(patchedScriptPath, { env: { ...process.env, HOME: tempHome, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
    const log2 = execSync('git log --oneline', { cwd: path.join(tempHome, '.superconductor') }).toString();
    const commitCount2 = log2.split('\n').filter(Boolean).length;

    // Should have same number of commits
    expect(commitCount2).toBe(commitCount1);
  });
});
