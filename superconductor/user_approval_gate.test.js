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

// Phase 2: Two-Stage Approval Process
// Task: Implement User Manual Approval Gate
// Sub-task: Write tests for prompting the user for final approval after Oracle approval.

console.log('--- User Approval Gate Unit Tests ---');

test('user approval is ignored if Oracle hasn\'t approved', () => {
  const stateManager = new ReviewApprovalState();
  // State is PENDING
  stateManager.transition('USER_APPROVE');
  assertEquals(stateManager.getState(), 'PENDING', 'Should remain PENDING if User approves before Oracle');
});

test('user approval is accepted after Oracle approval', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  // State is ORACLE_APPROVED
  stateManager.transition('USER_APPROVE');
  assertEquals(stateManager.getState(), 'USER_APPROVED', 'Should transition to USER_APPROVED if Oracle approved first');
});

test('rejection by either party blocks approval', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_REJECT');
  assertEquals(stateManager.isApproved(), false, 'Rejected by Oracle');
  
  stateManager.reset();
  stateManager.transition('ORACLE_APPROVE');
  stateManager.transition('USER_REJECT');
  assertEquals(stateManager.isApproved(), false, 'Rejected by User');
  assertEquals(stateManager.getState(), 'REJECTED', 'State should be REJECTED');
});
