import fs from 'fs/promises';
import path from 'path';
import type { Client } from "@libsql/client";
import os from 'os';

export class InstallerService {
  constructor(private db: Client, private projectRoot: string) {}

  private isSafePath(targetPath: string): boolean {
    const resolved = path.resolve(this.projectRoot, targetPath);
    return resolved.startsWith(this.projectRoot);
  }

  async install(localRegistryPath: string, sourceId: string, family: string, variant: string, targetPath?: string) {
    if (targetPath && !this.isSafePath(targetPath)) {
        throw new Error(`Security Error: targetPath ${targetPath} attempts to escape the project root.`);
    }
    
    const destDir = targetPath ? path.resolve(this.projectRoot, targetPath) : path.join(this.projectRoot, 'app', 'components', 'ui', family);
    await fs.mkdir(destDir, { recursive: true });

    // Check if it's an HTTP registry item (JSON file in cache)
    const httpJsonPath = path.join(os.homedir(), '.design_os', 'cache', sourceId, `${family}.json`);
    const isHttpItem = await fs.access(httpJsonPath).then(() => true).catch(() => false);

    if (isHttpItem) {
      const fileContent = await fs.readFile(httpJsonPath, 'utf-8');
      const itemData = JSON.parse(fileContent);
      
      const files = itemData.files || [];
      if (files.length === 0) {
        throw new Error(`No files found in registry item ${family}`);
      }

      for (const file of files) {
        // Guard against malicious registry file payloads
        if (file.path && file.path.includes('..')) {
            throw new Error(`Security Error: Malicious path traversal detected in registry payload: ${file.path}`);
        }
        if (file.target && file.target.includes('..')) {
             throw new Error(`Security Error: Malicious path traversal detected in registry target: ${file.target}`);
        }

        const filePath = file.target || path.join(destDir, path.basename(file.path));
        const finalPath = path.resolve(destDir, filePath);
        
        if (!finalPath.startsWith(this.projectRoot)) {
            throw new Error(`Security Error: Resolved path ${finalPath} escapes project root.`);
        }
        
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        
        if (file.content) {
            await fs.writeFile(finalPath, file.content);
        } else {
            console.error(`File ${file.path} has no content payload.`);
        }
      }
    } else {
      // Fallback to git-based local registry layout
      const sourceDir = path.join(localRegistryPath, 'components', family, variant);
      
      const files = await fs.readdir(sourceDir).catch(() => [] as string[]);
      if (files.length === 0) {
          throw new Error(`No files found in ${sourceDir} (Git sync) or ${httpJsonPath} (HTTP sync)`);
      }

      for (const file of files) {
        if (file === 'registry.json') continue;
        await fs.copyFile(path.join(sourceDir, file), path.join(destDir, file));
      }
    }

    const componentId = `${sourceId}:${family}-${variant}`;
    const versionHash = 'initial'; 

    await this.db.execute({
      sql: `
        INSERT INTO installed_components (id, component_id, local_path, version_hash)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          local_path = excluded.local_path,
          version_hash = excluded.version_hash
      `,
      args: [componentId, componentId, destDir, versionHash]
    });

    return destDir;
  }
}
