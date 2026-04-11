import { ReviewTriggerDetector } from './review_trigger_detector.js';

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
// Task: Integrate Trigger Detection
// Sub-task: Write tests for listening to trigger events in the track lifecycle.

console.log('--- Track Lifecycle Integration Unit Tests ---');

test('lifecycle detects readiness via commit message', () => {
  const detector = new ReviewTriggerDetector();
  const commitMessage = 'feat: implemented feature\n\nready-for-review';
  
  const isReady = detector.isTriggeredByCommit(commitMessage);
  assertEquals(isReady, true, 'Lifecycle should detect readiness from commit');
});

test('lifecycle detects readiness via command', () => {
  const detector = new ReviewTriggerDetector();
  const lastCommand = '/superconductor:review';
  
  const isReady = detector.isTriggeredByCommand(lastCommand);
  assertEquals(isReady, true, 'Lifecycle should detect readiness from command');
});

test('lifecycle detects readiness via plan.md', () => {
  const detector = new ReviewTriggerDetector();
  const planContent = '- [~] Task (READY FOR REVIEW)';
  
  const isReady = detector.isTriggeredByPlan(planContent);
  assertEquals(isReady, true, 'Lifecycle should detect readiness from plan.md');
});
