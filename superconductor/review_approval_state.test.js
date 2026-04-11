import { ReviewApprovalState } from './review_approval_state.js';

/**
 * Simple test runner.
 * @param {string} name 
 * @param {function(): void} fn 
 */
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

/**
 * Asserts that two values are strictly equal.
 * @param {*} actual 
 * @param {*} expected 
 * @param {string} message 
 */
function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

// Phase 0: Proactive Abstractions
// Task: Implement ReviewApprovalState Manager
// Sub-task: Write unit tests for state transitions (Oracle Approval, User Approval, Rejected).

console.log('--- ReviewApprovalState Unit Tests ---');

test('initial state is PENDING', () => {
  const stateManager = new ReviewApprovalState();
  assertEquals(stateManager.getState(), 'PENDING', 'Initial state should be PENDING');
});

test('transitions from PENDING to ORACLE_APPROVED', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  assertEquals(stateManager.getState(), 'ORACLE_APPROVED', 'Should transition to ORACLE_APPROVED');
});

test('transitions from ORACLE_APPROVED to USER_APPROVED', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  stateManager.transition('USER_APPROVE');
  assertEquals(stateManager.getState(), 'USER_APPROVED', 'Should transition to USER_APPROVED');
});

test('transitions from PENDING to REJECTED', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_REJECT');
  assertEquals(stateManager.getState(), 'REJECTED', 'Should transition to REJECTED on Oracle reject');
});

test('transitions from ORACLE_APPROVED to REJECTED', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  stateManager.transition('USER_REJECT');
  assertEquals(stateManager.getState(), 'REJECTED', 'Should transition to REJECTED on User reject');
});

test('resets from REJECTED to PENDING', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_REJECT');
  stateManager.reset();
  assertEquals(stateManager.getState(), 'PENDING', 'Should reset to PENDING');
});

test('isApproved() returns true only when USER_APPROVED', () => {
  const stateManager = new ReviewApprovalState();
  assertEquals(stateManager.isApproved(), false, 'Not approved when PENDING');
  stateManager.transition('ORACLE_APPROVE');
  assertEquals(stateManager.isApproved(), false, 'Not approved when ORACLE_APPROVED');
  stateManager.transition('USER_APPROVE');
  assertEquals(stateManager.isApproved(), true, 'Approved when USER_APPROVED');
});
