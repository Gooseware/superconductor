import { ComponentPayload } from './component_payload.js';

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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('--- ComponentPayload Unit Tests ---');

test('validate throws error if required fields are missing', () => {
  const payload = new ComponentPayload({});
  try {
    payload.validate();
    throw new Error('Validation should have failed');
  } catch (error) {
    assertEquals(error.message, 'Missing required fields: files, metadata', 'Should report missing required fields');
  }
});

test('validate passes with valid payload', () => {
  const payload = new ComponentPayload({
    files: [{ path: 'button.tsx', content: '...' }],
    metadata: { name: 'Button', type: 'atom' },
    comments: ['Looks good'],
    dependencies: ['lucide-react']
  });
  payload.validate();
});
