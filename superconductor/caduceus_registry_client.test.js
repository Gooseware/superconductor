import { CaduceusRegistryClient } from './caduceus_registry_client.js';
import { RegistryClientRouter } from './registry_client_router.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

async function runTests() {
  console.log('--- CaduceusRegistryClient & Router Unit Tests ---');
  
  const baseTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'superconductor-test-'));

  try {
    // Test 1
    await (async () => {
      const tempLibRoot = path.join(baseTempDir, 'lib_1');
      const client = new CaduceusRegistryClient(path.join(tempLibRoot, 'nonexistent'));
      const available = await client.isAvailable();
      assertEquals(available, false, 'isAvailable should return false if directory does not exist');
      console.log('✅ PASS: isAvailable returns false if directory does not exist');
    })();

    // Test 2
    await (async () => {
      const tempLibRoot = path.join(baseTempDir, 'lib_2');
      await fs.mkdir(tempLibRoot, { recursive: true });
      const client = new CaduceusRegistryClient(tempLibRoot);
      const available = await client.isAvailable();
      assertEquals(available, true, 'isAvailable should return true if directory exists');
      console.log('✅ PASS: isAvailable returns true if directory exists');
    })();

    // Test 3
    await (async () => {
      const tempLibRoot = path.join(baseTempDir, 'lib_3');
      await fs.mkdir(tempLibRoot, { recursive: true });
      
      // Initialize git in temp repo
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        await execAsync('git init && git config user.name "Test" && git config user.email "test@test.com" && git commit --allow-empty -m "initial"', { cwd: tempLibRoot });
      } catch (e) {
        // Ignore git setup failures
      }

      const client = new CaduceusRegistryClient(tempLibRoot);
      const payload = {
        files: [
          { path: 'index.ts', content: 'export const hello = "world";' }
        ],
        metadata: {
          name: 'hello-world',
          type: 'molecule',
          description: 'A test component',
          dependencies: ['react'],
          tags: ['test', 'hello']
        }
      };

      const result = await client.publishComponent(payload);
      assertEquals(result.success, true, 'Should succeed publishing');
      assertEquals(result.registry, 'caduceus', 'Should mark registry as caduceus');

      // Verify file creation
      const indexTsContent = await fs.readFile(
        path.join(tempLibRoot, 'src', 'components', 'hello-world', 'index.ts'),
        'utf-8'
      );
      assertEquals(indexTsContent, 'export const hello = "world";', 'index.ts content should match');

      const registryJson = JSON.parse(
        await fs.readFile(
          path.join(tempLibRoot, 'src', 'components', 'hello-world', 'registry.json'),
          'utf-8'
        )
      );

      assertEquals(registryJson.name, 'hello-world', 'Name should match');
      assertEquals(registryJson.type, 'molecule', 'Type should match');
      assertEquals(registryJson.dependencies, ['react'], 'Dependencies should match');
      assertEquals(registryJson.files, ['index.ts'], 'File list should match');
      console.log('✅ PASS: publishComponent writes correct files and registry.json');
    })();

    // Test 4
    await (async () => {
      const tempLibRoot = path.join(baseTempDir, 'lib_4');
      await fs.mkdir(tempLibRoot, { recursive: true });
      
      let mcpCalled = false;
      const mockMcpExecutor = () => {
        mcpCalled = true;
        return { success: true };
      };

      const router = new RegistryClientRouter(mockMcpExecutor, tempLibRoot);
      
      const payload = {
        files: [{ path: 'index.ts', content: 'export const hello = "world";' }],
        metadata: { name: 'hello-world' }
      };

      const result = await router.publishComponent(payload);
      assertEquals(result.registry, 'caduceus', 'Should route to Caduceus');
      assertEquals(mcpCalled, false, 'Should NOT invoke Design OS MCP executor');
      console.log('✅ PASS: RegistryClientRouter routes to Caduceus when available');
    })();

    // Test 5
    await (async () => {
      const tempLibRoot = path.join(baseTempDir, 'lib_5');
      
      let mcpCalled = false;
      const mockMcpExecutor = (params) => {
        mcpCalled = true;
        assertEquals(params.payload.metadata.name, 'hello-world', 'Payload should pass to MCP');
        return { success: true };
      };

      const router = new RegistryClientRouter(mockMcpExecutor, tempLibRoot);
      
      const payload = {
        files: [{ path: 'index.ts', content: 'export const hello = "world";' }],
        metadata: { name: 'hello-world' }
      };

      const result = await router.publishComponent(payload);
      assertEquals(result.success, true, 'Should succeed fallback');
      assertEquals(mcpCalled, true, 'Should invoke Design OS MCP executor');
      console.log('✅ PASS: RegistryClientRouter routes to Design OS when Caduceus is unavailable');
    })();

  } finally {
    // Cleanup base temp folder
    await fs.rm(baseTempDir, { recursive: true, force: true });
  }
}

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

runTests().catch(err => {
  console.error('❌ Test runner failed with error:', err);
  process.exit(1);
});
