import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Client for interacting with the Caduceus Golden Component Registry.
 */
export class CaduceusRegistryClient {
  /**
   * @param {string} [libraryRoot] - Override root path for the component library.
   */
  constructor(libraryRoot) {
    this.libraryRoot = libraryRoot || path.join(
      process.env.HOME || process.env.USERPROFILE || '/home/gooseware',
      '.config',
      'caduceus',
      'component-library'
    );
  }

  /**
   * Checks if the Caduceus registry library is initialized and available.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const stats = await fs.stat(this.libraryRoot);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Publishes a component to the Caduceus Golden Registry.
   * @param {Object} payload - The component payload.
   * @param {Array} payload.files - List of {path, content} objects.
   * @param {Object} payload.metadata - Component metadata.
   */
  async publishComponent(payload) {
    if (!payload || !payload.metadata || !payload.metadata.name) {
      throw new Error('Invalid payload: metadata.name is required');
    }

    const componentName = payload.metadata.name;
    const componentDir = path.join(this.libraryRoot, 'src', 'components', componentName);

    try {
      // Ensure the directory exists
      await fs.mkdir(componentDir, { recursive: true });

      const filePaths = [];

      // Write each file in payload
      for (const fileDef of payload.files) {
        const filePath = fileDef.path;
        const fullPath = path.join(componentDir, filePath);
        
        // Ensure parent folder of file exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        
        await fs.writeFile(fullPath, fileDef.content, 'utf-8');
        filePaths.push(filePath);
      }

      // Generate registry.json
      const registryData = {
        name: componentName,
        type: payload.metadata.type || 'molecule',
        description: payload.metadata.description || `Migrated ${componentName}`,
        dependencies: payload.metadata.dependencies || [],
        tags: payload.metadata.tags || [],
        files: filePaths
      };

      const registryJsonPath = path.join(componentDir, 'registry.json');
      await fs.writeFile(registryJsonPath, JSON.stringify(registryData, null, 2), 'utf-8');

      // Commit to Caduceus git repo
      await this.commitToGit(componentName);

      return {
        success: true,
        registry: 'caduceus',
        path: componentDir
      };
    } catch (error) {
      throw new Error(`Caduceus publication failed: ${error.message}`);
    }
  }

  /**
   * Stages and commits the component to the local git repository.
   * @param {string} componentName
   * @private
   */
  async commitToGit(componentName) {
    try {
      // 1. Stage the files
      await execAsync('git add .', { cwd: this.libraryRoot });

      // 2. Commit files
      const commitMessage = `feat(component): Add ${componentName} via Superconductor`;
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: this.libraryRoot });
      
      console.log(`[CaduceusRegistryClient] Committed ${componentName} to Golden Registry`);
    } catch (gitError) {
      // Git commit might fail if there are no changes, ignore or log it
      console.warn(`[CaduceusRegistryClient] Git command completed with warning: ${gitError.message}`);
    }
  }
}
