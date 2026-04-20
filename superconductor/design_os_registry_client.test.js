import { DesignOSRegistryClient } from './design_os_registry_client.js';

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

console.log('--- DesignOSRegistryClient Unit Tests ---');

test('publishComponent calls the executor with correct parameters', () => {
  let calledWith = null;
  const mockExecutor = (params) => {
    calledWith = params;
    return { success: true };
  };

  const client = new DesignOSRegistryClient(mockExecutor);
  const payload = { files: [], metadata: { name: 'Test' } };
  
  client.publishComponent(payload);

  assertEquals(calledWith.payload, payload, 'Should pass the payload to the executor');
});

test('publishComponent handles executor failure', () => {
  const mockExecutor = () => {
    throw new Error('MCP Tool Failed');
  };

  const client = new DesignOSRegistryClient(mockExecutor);
  try {
    client.publishComponent({});
    throw new Error('Should have failed');
  } catch (error) {
    assertEquals(error.message, 'Publication failed: MCP Tool Failed', 'Should wrap executor error');
  }
});
