import { PhaseGenerator } from './phase_generator.js';

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

// Phase 1: Iterative Review Loop Logic
// Task: Implement Remediation Phase Generation
// Sub-task: Write tests for generating a new remediation phase upon an Oracle rejection.

console.log('--- Remediation Phase Integration Unit Tests ---');

test('lifecycle appends remediation phase on Oracle rejection', () => {
  const generator = new PhaseGenerator();
  const planContent = `# Plan

## Phase 0: Complete
- [x] Task 1 [abcdefg]
`;
  
  const oracleFeedback = [
    'Refactor complex method in TriggerDetector',
    'Add missing documentation for ApprovalState',
  ];
  
  const iteration = 1;
  const newContent = generator.appendPhase(planContent, `Review Remediation (Iteration ${iteration})`, oracleFeedback);
  
  assertEquals(newContent.includes('## Review Remediation (Iteration 1)'), true, 'Should append the remediation phase');
  assertEquals(newContent.includes('- [ ] Task: Refactor complex method in TriggerDetector'), true, 'Should include first remediation task');
  assertEquals(newContent.includes('- [ ] Task: Add missing documentation for ApprovalState'), true, 'Should include second remediation task');
});
