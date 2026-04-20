import { migrateLocalRegistry } from './migrate_local_registry.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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

async function runTests() {
  console.log('--- migrateLocalRegistry Unit Tests ---');

  const tempRegistry = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-test-'));
  
  // Create a mock component
  const compDir = path.join(tempRegistry, 'blocks/test-block');
  await fs.mkdir(compDir, { recursive: true });
  await fs.writeFile(path.join(compDir, 'registry.json'), JSON.stringify({
    name: 'test-block',
    type: 'registry:block',
    files: [{ path: 'index.ts' }]
  }));
  await fs.writeFile(path.join(compDir, 'index.ts'), 'export const Test = () => {}');

  let publishedPayload = null;
  const mockExecutor = (params) => {
    publishedPayload = params.payload;
    return { success: true };
  };

  const results = await migrateLocalRegistry(tempRegistry, mockExecutor);

  if (results.migrated.length !== 1 || results.migrated[0] !== 'test-block/base') {
    throw new Error('Should have migrated 1 component');
  }

  if (!publishedPayload || publishedPayload.metadata.name !== 'test-block') {
    throw new Error('Payload metadata mismatch');
  }

  if (publishedPayload.files[0].path !== 'index.ts' || !publishedPayload.files[0].content.includes('Test')) {
    throw new Error('Payload file content mismatch');
  }

  console.log('✅ PASS: migrateLocalRegistry successfully migrates components');

  // Cleanup
  await fs.rm(tempRegistry, { recursive: true, force: true });
}

runTests().catch(console.error);
