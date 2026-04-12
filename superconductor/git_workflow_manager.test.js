import { GitWorkflowManager } from './git_workflow_manager.js';

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
