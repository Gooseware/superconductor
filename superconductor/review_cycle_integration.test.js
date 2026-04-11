import { ReviewTriggerDetector } from './review_trigger_detector.js';
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
// Task: Implement Re-review Cycle
// Sub-task: Write tests for looping the workflow back to the "Review" state from a "Remediation" state upon a trigger.

console.log('--- Review Cycle Integration Unit Tests ---');

test('workflow loops from remediation back to review trigger', () => {
  const detector = new ReviewTriggerDetector();
  const generator = new PhaseGenerator();
  
  let planContent = `# Plan
## Phase 0: Complete
- [x] Task 1 [abcdefg]
`;

  // 1. Oracle Rejection (Simulation)
  const feedback = ['Fix bug in parser'];
  planContent = generator.appendPhase(planContent, 'Review Remediation (Iteration 1)', feedback);
  
  // 2. Implementation (Simulation)
  planContent = planContent.replace('- [ ] Task: Fix bug in parser', '- [x] Task: Fix bug in parser [hijklmn] (READY FOR REVIEW)');
  
  // 3. Trigger Detection
  const isTriggered = detector.isTriggeredByPlan(planContent);
  assertEquals(isTriggered, true, 'Workflow should detect re-review trigger after remediation');
});
