import fs from 'fs/promises';
import path from 'path';
import { RegistryClientRouter } from './registry_client_router.js';

/**
 * Script to migrate local project registries to the centralized Design OS registry.
 */
export async function migrateLocalRegistry(registryRoot, clientExecutor, options = {}) {
  const client = new RegistryClientRouter(clientExecutor, options.libraryPath);
  const results = { migrated: [], failed: [] };

  async function scanDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        const registryJsonPath = path.join(fullPath, 'registry.json');
        
        try {
          await fs.access(registryJsonPath);
          await migrateComponent(fullPath, registryJsonPath);
        } catch (e) {
          // No registry.json here, recurse
          await scanDirectory(fullPath);
        }
      }
    }
  }

  async function readComponentMetadata(srcDir) {
    const registryJsonPath = path.join(srcDir, 'registry.json');
    const config = JSON.parse(await fs.readFile(registryJsonPath, 'utf-8'));
    const isBlock = config.type?.includes('block') || srcDir.includes('/blocks/');
    const family = config.name;
    const variant = config.variant || 'base';

    return {
      name: config.name,
      family: family,
      variant: variant,
      type: isBlock ? 'organism' : (config.type || 'molecule'),
      description: config.description || `Migrated ${family} ${variant}`,
      intent: config.intent || 'migration',
      tags: config.tags || [],
      dependencies: config.dependencies || [],
      comments: ['Migrated from local registry'],
      _config: config
    };
  }

  async function copyComponentFiles(srcDir, config) {
    const files = [];
    if (config.files && Array.isArray(config.files)) {
      for (const fileDef of config.files) {
        const filePath = typeof fileDef === 'string' ? fileDef : fileDef.path;
        const absoluteFilePath = path.join(srcDir, filePath);
        const content = await fs.readFile(absoluteFilePath, 'utf-8');
        files.push({
          path: filePath,
          content: content
        });
      }
    } else {
      const srcDirInner = path.join(srcDir, 'src');
      const srcExists = await fs.access(srcDirInner).then(() => true).catch(() => false);
      if (srcExists) {
         await addFilesFromDir(srcDirInner, 'src', files);
      }
    }
    return files;
  }

  async function writeDogmaFile(cName, data) {
    console.log(`[Migrate] Publishing ${cName}...`);
    await client.publishComponent(data);
  }

  async function migrateComponent(componentDir, registryJsonPath) {
    console.log(`[Migrate] Found component at ${componentDir}`);
    try {
      const metadata = await readComponentMetadata(componentDir);
      const config = metadata._config;
      delete metadata._config;

      const files = await copyComponentFiles(componentDir, config);

      if (files.length === 0) {
        console.warn(`[Migrate] No files found for ${metadata.family}/${metadata.variant}, skipping.`);
        return;
      }

      const payload = {
        files,
        metadata
      };

      await writeDogmaFile(`${metadata.family}/${metadata.variant}`, payload);
      results.migrated.push(`${metadata.family}/${metadata.variant}`);
    } catch (error) {
      console.error(`[Migrate] Failed to migrate ${componentDir}:`, error.message);
      results.failed.push({ path: componentDir, error: error.message });
    }
  }

  async function addFilesFromDir(dir, relativeRoot, fileList) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        await addFilesFromDir(fullPath, relativePath, fileList);
      } else {
        const content = await fs.readFile(fullPath, 'utf-8');
        fileList.push({ path: relativePath, content });
      }
    }
  }

  await scanDirectory(registryRoot);
  return results;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const registryRoot = process.argv[2];
  if (!registryRoot) {
    console.error('Usage: node migrate_local_registry.js <registry_root_path>');
    process.exit(1);
  }

  // Note: In real usage, this would be called by the agent with access to MCP tools.
  // For the script to be runnable standalone, it would need a mock or real MCP client.
  console.log('Migration script loaded. To execute, call migrateLocalRegistry() with an executor.');
}
