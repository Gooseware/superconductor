import fs from 'fs/promises';
import path from 'path';
import { AtomicGitService } from './AtomicGitService.js';

export interface ComponentFile {
  path: string;
  content: string;
}

export interface ComponentMetadata {
  name: string;
  family: string;
  variant: string;
  type: 'atom' | 'molecule' | 'organism' | 'page' | 'layout' | 'form' | 'util';
  description: string;
  intent: string;
  tags?: string[];
  dependencies?: string[];
  comments?: string[];
}

export interface ComponentPayload {
  files: ComponentFile[];
  metadata: ComponentMetadata;
}

export class CentralizedPublishService {
  private atomicGit: AtomicGitService;

  constructor(private registryRepoPath: string) {
    this.atomicGit = new AtomicGitService(registryRepoPath);
  }

  private isSafePath(targetPath: string): boolean {
    const resolved = path.resolve(this.registryRepoPath, targetPath);
    return resolved.startsWith(this.registryRepoPath);
  }

  async publish(payload: ComponentPayload) {
    const { metadata, files } = payload;
    const { family, variant, type } = metadata;

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

    await fs.mkdir(variantDir, { recursive: true });

    // 1. Write component files
    const writtenFiles: string[] = [];
    for (const file of files) {
      const targetFilePath = path.join(variantDir, file.path);
      if (!this.isSafePath(targetFilePath)) {
        throw new Error(`Security Error: file path ${file.path} escapes registry path.`);
      }
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
      await fs.writeFile(targetFilePath, file.content);
      writtenFiles.push(targetFilePath);
    }

    // 2. Update family registry.json
    const regPath = path.join(familyDir, 'registry.json');
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
      type,
      description: metadata.description,
      intent: metadata.intent,
      tags: metadata.tags || [],
      dependencies: metadata.dependencies || [],
      comments: metadata.comments || []
    };

    await fs.writeFile(regPath, JSON.stringify(familyRegistry, null, 2));
    writtenFiles.push(regPath);

    // 3. Commit and Push
    const commitMessage = `vet(${type}): ${family}/${variant} - centralized publishing`;
    const relativePaths = writtenFiles.map(f => path.relative(this.registryRepoPath, f));
    
    return await this.atomicGit.commitAndPush(commitMessage, relativePaths);
  }

  async addComment(family: string, variant: string, comment: string) {
    const familyDir = path.join(this.registryRepoPath, 'components', family);
    const regPath = path.join(familyDir, 'registry.json');

    const existing = await fs.readFile(regPath, 'utf-8');
    const familyRegistry = JSON.parse(existing);

    if (!familyRegistry.variants[variant]) {
      throw new Error(`Variant ${variant} not found in family ${family}`);
    }

    if (!familyRegistry.variants[variant].comments) {
      familyRegistry.variants[variant].comments = [];
    }

    familyRegistry.variants[variant].comments.push(comment);

    await fs.writeFile(regPath, JSON.stringify(familyRegistry, null, 2));

    const commitMessage = `comment(${family}/${variant}): added new comment`;
    return await this.atomicGit.commitAndPush(commitMessage, [path.relative(this.registryRepoPath, regPath)]);
  }
}
