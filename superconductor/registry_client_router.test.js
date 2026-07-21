import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RegistryClientRouter } from './registry_client_router.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function run() {
  console.log('--- RegistryClientRouter Unit Tests ---');

  // Test 1: Routes to DesignOSRegistryClient when Caduceus is NOT available
  try {
    let designOSCalled = false;
    const mockExecutor = (params) => {
      designOSCalled = true;
      return { success: true };
    };

    const router = new RegistryClientRouter({
      executor: mockExecutor,
      libraryPath: '/non/existent/path/for/sure'
    });

    const payload = {
      files: [],
      metadata: { name: 'TestComponent', type: 'molecule' }
    };

    const result = await router.publishComponent(payload);
    assertEquals(designOSCalled, true, 'Should delegate to DesignOSRegistryClient');
    assertEquals(result.success, true, 'Should return success response');
    console.log('✅ PASS: Routes to DesignOSRegistryClient when Caduceus is not available');
  } catch (error) {
    console.error('❌ FAIL: Routes to DesignOSRegistryClient when Caduceus is not available');
    console.error(error);
    process.exit(1);
  }

  // Test 2: Routes to CaduceusRegistryClient when Caduceus IS available
  try {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caduceus-router-test-'));
    
    let designOSCalled = false;
    const mockExecutor = (params) => {
      designOSCalled = true;
      return { success: true };
    };

    let gitCalled = false;
    const mockExec = (cmd, opts) => {
      gitCalled = true;
      return '';
    };

    const router = new RegistryClientRouter({
      executor: mockExecutor,
      libraryPath: tempDir,
      exec: mockExec
    });

    const payload = {
      files: [
        { path: 'index.js', content: 'const a = 1;' }
      ],
      metadata: { name: 'Button', type: 'molecule' }
    };

    const result = await router.publishComponent(payload);
    assertEquals(designOSCalled, false, 'Should NOT delegate to DesignOSRegistryClient');
    assertEquals(result.success, true, 'Should return success response');
    
    // Check file exists
    const fileExists = await fs.access(path.join(tempDir, 'src/components/Button/index.js')).then(() => true).catch(() => false);
    assertEquals(fileExists, true, 'Should have written component files to temp library path');

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('✅ PASS: Routes to CaduceusRegistryClient when Caduceus is available');
  } catch (error) {
    console.error('❌ FAIL: Routes to CaduceusRegistryClient when Caduceus is available');
    console.error(error);
    process.exit(1);
  }
}

run();
