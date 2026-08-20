import { GitWorkflowManager, resolveTargetBranch } from './git_workflow_manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error);
    process.exit(1);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

console.log('--- GitWorkflowManager Unit Tests ---');

test('resolveTargetBranch reads tech-stack.md and falls back to main', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-wf-test-'));
  try {
    // No tech-stack.md -> fallback 'main'
    assertEquals(resolveTargetBranch(tmpDir), 'main', 'Should fallback to main');

    // Override branch provided -> returns override
    assertEquals(resolveTargetBranch(tmpDir, 'custom-dev'), 'custom-dev', 'Should return override');

    // Create tech-stack.md with target branch
    const scDir = path.join(tmpDir, 'superconductor');
    fs.mkdirSync(scDir, { recursive: true });
    fs.writeFileSync(
      path.join(scDir, 'tech-stack.md'),
      '# Tech Stack\n\n## Development Preferences\n- **Target Branch:** `release-v1`\n',
      'utf8'
    );

    assertEquals(resolveTargetBranch(tmpDir), 'release-v1', 'Should resolve from tech-stack.md');
    assertEquals(resolveTargetBranch(tmpDir, 'override-branch'), 'override-branch', 'Override should take precedence');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createBranchFromMain checks if main exists and creates branch', () => {
  const commands = [];
  const mockExec = (cmd) => {
    commands.push(cmd);
    if (cmd === 'git branch --list main') return '  main';
    return '';
  };

  const manager = new GitWorkflowManager(mockExec);
  manager.createBranchFromMain('feat_abc');

  assertEquals(commands[0], 'git branch --list main', 'Should first check if main exists');
  assertEquals(commands[1], 'git checkout main', 'Should switch to main');
  assertEquals(commands[2], 'git pull origin main', 'Should pull latest main');
  assertEquals(commands[3], 'git checkout -b track/feat_abc', 'Should create and switch to track branch');
});

test('createBranch with dynamic target branch', () => {
  const commands = [];
  const mockExec = (cmd) => {
    commands.push(cmd);
    if (cmd === 'git branch --list dev') return '  dev';
    return '';
  };

  const manager = new GitWorkflowManager(mockExec);
  manager.createBranch('feat_xyz', 'dev');

  assertEquals(commands[0], 'git branch --list dev', 'Should check if dev exists');
  assertEquals(commands[1], 'git checkout dev', 'Should switch to dev');
  assertEquals(commands[2], 'git pull origin dev', 'Should pull latest dev');
  assertEquals(commands[3], 'git checkout -b track/feat_xyz', 'Should create track branch');
});

test('mergeToTarget performs merge and delete branch', () => {
  const commands = [];
  const mockExec = (cmd) => {
    commands.push(cmd);
    return '';
  };

  const manager = new GitWorkflowManager(mockExec);
  manager.mergeToTarget('dev', 'track/feat_abc');

  assertEquals(commands[0], 'git checkout dev', 'Should switch to target branch');
  assertEquals(commands[1], 'git pull origin dev', 'Should pull latest target');
  assertEquals(commands[2], 'git merge track/feat_abc', 'Should merge track branch');
  assertEquals(commands[3], 'git push origin dev', 'Should push merge results');
  assertEquals(commands[4], 'git branch -d track/feat_abc', 'Should delete track branch locally');
  assertEquals(commands[5], 'git push origin --delete track/feat_abc', 'Should delete track branch remotely');
});

test('mergeToTarget with no-ff and trailers', () => {
  const commands = [];
  const mockExec = (cmd) => {
    commands.push(cmd);
    return '';
  };

  const manager = new GitWorkflowManager(mockExec);
  manager.mergeToTarget('dev', 'track/feat_abc', { noFf: true, trailer: 'Swarm-Authorized: true | reviewers: r1,r2' });

  assertEquals(commands[0], 'git checkout dev', 'Should switch to target branch');
  assertEquals(commands[1], 'git pull origin dev', 'Should pull latest target');
  assertEquals(
    commands[2],
    'git merge --no-ff track/feat_abc -m "feat(superconductor): Merge track/feat_abc into dev\n\nSwarm-Authorized: true | reviewers: r1,r2"',
    'Should merge with --no-ff and trailer'
  );
});
