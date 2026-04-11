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

// Phase 0: Proactive Abstractions
// Task: Implement PhaseGenerator Utility
// Sub-task: Write unit tests for dynamically appending phases to a markdown file string.

console.log('--- PhaseGenerator Unit Tests ---');

test('appends a new phase to plan.md content', () => {
  const generator = new PhaseGenerator();
  const initialContent = `# Implementation Plan: Test Track

## Phase 0: Initial Phase
- [x] Task 1 [abcdefg]
- [x] Task 2 [hijklmn]
`;
  
  const phaseTitle = 'Review Remediation (Iteration 1)';
  const tasks = [
    'Address Oracle feedback regarding modularity',
    'Refactor TriggerDetector to use separate parsers',
  ];
  
  const updatedContent = generator.appendPhase(initialContent, phaseTitle, tasks);
  
  assertEquals(updatedContent.includes(`## ${phaseTitle}`), true, 'Should include the new phase title');
  assertEquals(updatedContent.includes('- [ ] Task: Address Oracle feedback regarding modularity'), true, 'Should include task 1');
  assertEquals(updatedContent.includes('- [ ] Task: Refactor TriggerDetector to use separate parsers'), true, 'Should include task 2');
  
  const expectedEnd = `
## Review Remediation (Iteration 1)
- [ ] Task: Address Oracle feedback regarding modularity
- [ ] Task: Refactor TriggerDetector to use separate parsers
`;
  assertEquals(updatedContent.endsWith(expectedEnd), true, 'Should append the phase at the end of the content');
});

test('handles empty content gracefully', () => {
  const generator = new PhaseGenerator();
  const initialContent = '';
  const phaseTitle = 'Initial Phase';
  const tasks = ['Task 1'];
  
  const updatedContent = generator.appendPhase(initialContent, phaseTitle, tasks);
  
  const expected = `## Initial Phase
- [ ] Task: Task 1
`;
  assertEquals(updatedContent, expected, 'Should not add leading newlines for empty content');
});
