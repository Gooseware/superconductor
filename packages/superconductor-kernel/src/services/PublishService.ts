import fs from 'fs/promises';
import path from 'path';
import { simpleGit } from 'simple-git';

export class PublishService {
  constructor(private registryRepoPath: string) {}

  private isSafePath(targetPath: string): boolean {
    const resolved = path.resolve(this.registryRepoPath, targetPath);
    return resolved.startsWith(this.registryRepoPath);
  }

  async publish(
    sourcePath: string,
    family: string,
    variant: string,
    metadata: {
      type: string;
      description: string;
      intent: string;
      tags: string[];
      dependencies: string[];
    }
  ) {
    if (family.includes('..') || family.includes('/') || family.includes('\\')) {
        throw new Error("Invalid family name. Cannot contain path separators.");
    }
    if (variant.includes('..') || variant.includes('/') || variant.includes('\\')) {
        throw new Error("Invalid variant name. Cannot contain path separators.");
    }

    const familyDir = path.join(this.registryRepoPath, 'components', family);
    const variantDir = path.join(familyDir, variant);
    
    if (!this.isSafePath(variantDir)) {
        throw new Error("Security Error: variant directory escapes registry path.");
    }

    const regPath = path.join(familyDir, 'registry.json');

    await fs.mkdir(variantDir, { recursive: true });

    const fileName = path.basename(sourcePath);
    await fs.copyFile(sourcePath, path.join(variantDir, fileName));

    let familyRegistry: any = { name: family, variants: {} };
    try {
      const existing = await fs.readFile(regPath, 'utf-8');
      familyRegistry = JSON.parse(existing);
    } catch (e: any) {
        if (e.code !== 'ENOENT') {
            console.error("Failed to parse existing registry JSON, creating fresh:", e instanceof Error ? e.message : String(e));
        }
    }

    familyRegistry.variants[variant] = {
      type: metadata.type,
      description: metadata.description,
      intent: metadata.intent,
      tags: metadata.tags,
      dependencies: metadata.dependencies
    };

    await fs.writeFile(regPath, JSON.stringify(familyRegistry, null, 2));

    const git = simpleGit(this.registryRepoPath);
    
    // Scoped add for the family directory
    await git.add([path.join('components', family)]);
    
    // Commit and Push
    const commitMessage = `vet(${metadata.type}): ${family}/${variant} - passed dogma check`;
    const commitResult = await git.commit(commitMessage);
    
    let pushed = false;
    try {
        await git.push();
        pushed = true;
    } catch (e) {
        console.error("Could not push to remote. Changes committed locally.", e instanceof Error ? e.message : String(e));
    }

    return {
      path: `${family}/${variant}`,
      commitHash: commitResult.commit,
      pushed
    };
  }

  async remove(family: string, variant: string) {
    if (family.includes('..') || family.includes('/') || family.includes('\\')) {
        throw new Error("Invalid family name.");
    }
    if (variant.includes('..') || variant.includes('/') || variant.includes('\\')) {
        throw new Error("Invalid variant name.");
    }

    const familyDir = path.join(this.registryRepoPath, 'components', family);
    const variantDir = path.join(familyDir, variant);
    
    if (!this.isSafePath(variantDir)) {
        throw new Error("Security Error: variant directory escapes registry path.");
    }

    const regPath = path.join(familyDir, 'registry.json');

    // 1. Remove the variant directory
    await fs.rm(variantDir, { recursive: true, force: true });

    // 2. Update family registry.json
    try {
      const existing = await fs.readFile(regPath, 'utf-8');
      const familyRegistry = JSON.parse(existing);
      
      if (familyRegistry.variants && familyRegistry.variants[variant]) {
        delete familyRegistry.variants[variant];
        
        await fs.writeFile(regPath, JSON.stringify(familyRegistry, null, 2));
      }
    } catch (e) {
      console.error("Failed to update registry.json during removal:", e instanceof Error ? e.message : String(e));
    }

    const git = simpleGit(this.registryRepoPath);
    // Scoped add for the family directory
    await git.add([path.join('components', family)]);
    
    const commitMessage = `chore(remove): ${family}/${variant}`;
    const commitResult = await git.commit(commitMessage);
    
    try {
        await git.push();
    } catch (e) {
        console.error("Could not push removal to remote.", e instanceof Error ? e.message : String(e));
    }

    return {
      success: true,
      commitHash: commitResult.commit
    };
  }
}
