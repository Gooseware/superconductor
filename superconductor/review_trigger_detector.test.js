import { ReviewTriggerDetector } from './review_trigger_detector.js';

/**
 * Simple test runner for Node.js without external dependencies.
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
// Task: Implement ReviewTriggerDetector
// Sub-task: Write unit tests for trigger parsing (Git commit parser, CLI command parser, plan.md status reader).

console.log('--- ReviewTriggerDetector Unit Tests ---');

test('detects trigger in commit message', () => {
  const detector = new ReviewTriggerDetector();
  assertEquals(detector.isTriggeredByCommit('feat: add feature\n\nready-for-review'), true, 'Should detect "ready-for-review"');
  assertEquals(detector.isTriggeredByCommit('feat: add feature'), false, 'Should not detect trigger if absent');
});

test('detects trigger in CLI command', () => {
  const detector = new ReviewTriggerDetector();
  assertEquals(detector.isTriggeredByCommand('/superconductor:review'), true, 'Should detect "/superconductor:review"');
  assertEquals(detector.isTriggeredByCommand('/superconductor:status'), false, 'Should not detect other commands');
});

test('detects trigger in plan.md status', () => {
  const detector = new ReviewTriggerDetector();
  const planContent = `
## Phase 1
- [x] Task 1 [abcdefg]
- [~] Task 2 (READY FOR REVIEW)
`;
  assertEquals(detector.isTriggeredByPlan(planContent), true, 'Should detect "(READY FOR REVIEW)" in plan.md');
  
  const incompletePlan = `
## Phase 1
- [x] Task 1 [abcdefg]
- [~] Task 2
`;
  assertEquals(detector.isTriggeredByPlan(incompletePlan), false, 'Should not detect trigger if "(READY FOR REVIEW)" is absent');
});
