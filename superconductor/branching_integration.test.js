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

console.log('--- Branching Integration Unit Tests ---');

test('lifecycle integration uses GitWorkflowManager correctly', () => {
  const commands = [];
  const mockExec = (cmd) => {
    commands.push(cmd);
    if (cmd === 'git branch --list main') return '  main';
    return '';
  };

  const manager = new GitWorkflowManager(mockExec);
  
  // Simulate the prompt logic: "Use the GitWorkflowManager utility to ensure the track branch exists and is derived from main."
  manager.createBranchFromMain('branch_management_20260411');

  assertEquals(commands[0], 'git branch --list main', 'Integration check failed: First command should check main');
  assertEquals(commands[1], 'git checkout main', 'Integration check failed: Should checkout main');
  assertEquals(commands[2], 'git pull origin main', 'Integration check failed: Should pull main');
  assertEquals(commands[3], 'git checkout -b track/branch_management_20260411', 'Integration check failed: Should create track branch');
});
