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
// Task: Implement Oracle Automated Approval Gate
// Sub-task: Write tests for blocking the cleanup phase if the Oracle hasn't approved.

console.log('--- Approval Gate Integration Unit Tests ---');

test('cleanup is blocked if Oracle hasn\'t approved', () => {
  const stateManager = new ReviewApprovalState();
  // State is PENDING
  assertEquals(stateManager.isApproved(), false, 'Cleanup should be blocked in PENDING state');
});

test('cleanup is blocked if only Oracle has approved', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  // State is ORACLE_APPROVED
  assertEquals(stateManager.isApproved(), false, 'Cleanup should be blocked in ORACLE_APPROVED state');
});

test('cleanup is allowed only after both Oracle and User approval', () => {
  const stateManager = new ReviewApprovalState();
  stateManager.transition('ORACLE_APPROVE');
  stateManager.transition('USER_APPROVE');
  // State is USER_APPROVED
  assertEquals(stateManager.isApproved(), true, 'Cleanup should be allowed in USER_APPROVED state');
});
