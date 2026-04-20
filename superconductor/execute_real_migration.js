import { migrateLocalRegistry } from './migrate_local_registry.js';

// This is a placeholder for the agent to inject the real MCP executor
export async function runRealMigration(registryRoot, executor) {
  console.log(`Starting migration from ${registryRoot}...`);
  const results = await migrateLocalRegistry(registryRoot, executor);
  console.log('Migration finished.');
  console.log('Migrated:', results.migrated);
  console.log('Failed:', results.failed);
  return results;
}
