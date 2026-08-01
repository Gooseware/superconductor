import fs from 'fs/promises';
import path from 'path';
import type { Client } from "@libsql/client";
import os from 'os';

export class RegistryService {
  constructor(private db: Client, private registryPath: string) { }

  async syncFromLocalPath(sourceId: string, localPath: string) {
    const registryPath = path.join(localPath, 'registry.json');
    const content = await fs.readFile(registryPath, 'utf-8').catch(() => null);

    await this.db.execute({
      sql: 'UPDATE sources SET last_synced_at = ? WHERE id = ?',
      args: [new Date().toISOString(), sourceId]
    });

    const currentIds: string[] = [];

    // 1. Sync Components
    const componentsDir = path.join(localPath, 'components');
    const componentFamilies = await fs.readdir(componentsDir).catch(() => [] as string[]);

    for (const family of componentFamilies) {
      const familyDir = path.join(componentsDir, family);
      const stat = await fs.stat(familyDir).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const compRegistryPath = path.join(familyDir, 'registry.json');
      const compRegistryExists = await fs.access(compRegistryPath).then(() => true).catch(() => false);

      if (compRegistryExists) {
        const compRegistryContent = await fs.readFile(compRegistryPath, 'utf-8');
        const compRegistry = JSON.parse(compRegistryContent);

        const variants = compRegistry.variants || {};
        for (const [variant, details] of Object.entries(variants)) {
          const id = `${sourceId}:${family}-${variant}`;
          currentIds.push(id);
          const d = details as any;
          await this.db.execute({
            sql: `
              INSERT INTO registry_items (id, name, family, variant, intent_tags, description, source_id, type, complexity, vetted)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                family = excluded.family,
                variant = excluded.variant,
                intent_tags = excluded.intent_tags,
                description = excluded.description,
                source_id = excluded.source_id,
                type = excluded.type,
                complexity = excluded.complexity,
                vetted = excluded.vetted
            `,
            args: [
              id,
              `${family} (${variant})`,
              family,
              variant,
              JSON.stringify(d.tags || []),
              d.description || '',
              sourceId,
              d.type || 'component',
              d.complexity || 'molecule',
              1
            ]
          });
        }
      }
    }

    // 2. Sync Blocks
    const blocksDir = path.join(localPath, 'blocks');
    const blockNames = await fs.readdir(blocksDir).catch(() => [] as string[]);

    for (const blockName of blockNames) {
      const blockDir = path.join(blocksDir, blockName);
      const stat = await fs.stat(blockDir).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;

      const blockRegistryPath = path.join(blockDir, 'registry.json');
      const blockRegistryExists = await fs.access(blockRegistryPath).then(() => true).catch(() => false);

      if (blockRegistryExists) {
        const blockRegistryContent = await fs.readFile(blockRegistryPath, 'utf-8');
        const blockRegistry = JSON.parse(blockRegistryContent);

        const id = `${sourceId}:block-${blockName}`;
        currentIds.push(id);
        await this.db.execute({
          sql: `
            INSERT INTO registry_items (id, name, family, variant, intent_tags, description, source_id, type, complexity, vetted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              family = excluded.family,
              variant = excluded.variant,
              intent_tags = excluded.intent_tags,
              description = excluded.description,
              source_id = excluded.source_id,
              type = excluded.type,
              complexity = excluded.complexity,
              vetted = excluded.vetted
          `,
          args: [
            id,
            blockRegistry.name || blockName,
            blockName,
            'block',
            JSON.stringify(blockRegistry.tags || []),
            blockRegistry.description || '',
            sourceId,
            'block',
            'organism',
            1
          ]
        });
      }
    }

    // 3. Cleanup orphaned items
    if (currentIds.length > 0) {
      await this.db.execute({
        sql: `DELETE FROM registry_items WHERE source_id = ? AND id NOT IN (${currentIds.map(() => '?').join(',')})`,
        args: [sourceId, ...currentIds]
      });
    } else {
      await this.db.execute({
        sql: 'DELETE FROM registry_items WHERE source_id = ?',
        args: [sourceId]
      });
    }
  }

  async listBlocks() {
    const result = await this.db.execute({
      sql: `
        SELECT r.*, s.url as source_url
        FROM registry_items r
        JOIN sources s ON r.source_id = s.id
        WHERE r.type = 'block'
      `,
      args: []
    });
    return result.rows;
  }

  async getBlockWiring(blockName: string) {
    // We assume the blocks are in the local registry for now
    // In a real scenario, we'd look up the source path
    const wiringPath = path.join(this.registryPath, 'blocks', blockName, 'WIRING.md');
    try {
      return await fs.readFile(wiringPath, 'utf-8');
    } catch (e) {
      throw new Error(`WIRING.md not found for block ${blockName}`);
    }
  }

  async syncFromHttp(sourceId: string, url: string, etag?: string | null): Promise<{ status: number, etag?: string }> {
    try {
      const headers: Record<string, string> = {};
      if (etag) {
        headers['If-None-Match'] = etag;
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 15000);

      let response;
      try {
        response = await fetch(url, { headers, signal: abortController.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 304) {
        return { status: 304 };
      }

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const newEtag = response.headers.get('etag') || undefined;
      const registryData = await response.json();

      const items = registryData.items || [];
      const cacheDir = path.join(os.homedir(), '.design_os', 'cache', sourceId);
      await fs.mkdir(cacheDir, { recursive: true });

      // Batch item fetches to prevent N+1 unbounded fan-out
      const batchSize = 5;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(async (item: any) => {
          try {
            let itemDetails = item;
            const itemName = item.name;
            // Aceternity style: if files have no content, fetch the specific component json
            const hasContent = item.files && item.files.some((f: any) => f.content);

            if (!hasContent) {
              const componentJsonUrl = url.replace('registry.json', `${itemName}.json`);
              const itemController = new AbortController();
              const itemTimeout = setTimeout(() => itemController.abort(), 10000);
              try {
                const itemResp = await fetch(componentJsonUrl, { signal: itemController.signal });
                if (itemResp.ok) {
                  itemDetails = await itemResp.json();
                }
              } catch (e) {
                console.error(`Failed to fetch full detail for ${itemName} from ${componentJsonUrl}`);
              } finally {
                clearTimeout(itemTimeout);
              }
            }

            await fs.writeFile(path.join(cacheDir, `${itemName}.json`), JSON.stringify(itemDetails, null, 2));

        const id = `${sourceId}:${itemName}-base`;
        const type = itemDetails.type || (itemName.includes('block') ? 'block' : 'component');
        const tags = itemDetails.tags || itemDetails.categories || [];
        
        await this.db.execute({
          sql: `
            INSERT INTO registry_items (id, name, family, variant, intent_tags, description, source_id, type, complexity, vetted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              family = excluded.family,
              variant = excluded.variant,
              intent_tags = excluded.intent_tags,
              description = excluded.description,
              source_id = excluded.source_id,
              type = excluded.type,
              complexity = excluded.complexity,
              vetted = excluded.vetted
          `,
          args: [
            id,
            itemName,
            itemName,
            'base',
            JSON.stringify(tags),
            itemDetails.description || '',
            sourceId,
            type,
            itemDetails.complexity || (type === 'block' ? 'organism' : 'atom'),
            sourceId.startsWith('local') ? 1 : 0
          ]
        });
          } catch (itemErr) {
            console.error(`Failed to sync item ${item.name} from ${url}:`, itemErr instanceof Error ? itemErr.message : String(itemErr));
          }
        }));
      }

      return { status: 200, etag: newEtag };
    } catch (error) {
      console.error(`Failed to sync registry from ${url}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
