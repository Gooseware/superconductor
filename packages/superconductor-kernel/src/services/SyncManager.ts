import { ConfigService } from './ConfigService.js';
import { RegistryService } from './RegistryService.js';
import { GitService } from './GitService.js';
import type { Client } from "@libsql/client";
import crypto from 'crypto';

export class SyncManager {
  private isSyncing = false;
  private intervalHandle?: NodeJS.Timeout;
  private timeoutHandle?: NodeJS.Timeout;

  constructor(
    private db: Client,
    private registryService: RegistryService,
    private gitService: GitService
  ) {}

  public startDaemon(intervalMs: number = 60 * 60 * 1000) {
    this.timeoutHandle = setTimeout(() => {
      console.error("[SyncManager] Starting initial catch-up sync...");
      this.runFullSync().catch((e: any) => console.error(e instanceof Error ? e.message : String(e)));
    }, 5000);

    this.intervalHandle = setInterval(() => {
      if (this.isSyncing) {
          console.error("[SyncManager] Skipping scheduled sync - previous sync still in progress");
          return;
      }
      console.error("[SyncManager] Running scheduled background sync...");
      this.runFullSync().catch((e: any) => console.error(e instanceof Error ? e.message : String(e)));
    }, intervalMs);
  }

  public stopDaemon() {
      if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
      if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  public async runFullSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const config = ConfigService.getConfig();
      if (!config.registries || config.registries.length === 0) {
        return;
      }

      const batchSize = 10;
      for (let i = 0; i < config.registries.length; i += batchSize) {
        const batch = config.registries.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(reg => this.syncRegistry(reg)));
      }
      
      console.error(`[SyncManager] Finished syncing ${config.registries.length} registries.`);
    } catch (err) {
      console.error("[SyncManager] Full sync failed", err instanceof Error ? err.message : String(err));
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncRegistry(registry: any) {
    const sourceId = crypto.createHash('sha256').update(registry.url).digest('base64url').slice(0, 12);
    
    await this.db.execute({
      sql: `
        INSERT INTO sources (id, name, url, type, characteristics) 
        VALUES (?, ?, ?, ?, ?) 
        ON CONFLICT(id) DO UPDATE SET characteristics = excluded.characteristics
      `,
      args: [sourceId, registry.name, registry.url, registry.type, JSON.stringify(registry.characteristics || [])],
    });

    if (registry.type === 'url') {
      const sourceQuery = await this.db.execute({
        sql: 'SELECT etag FROM sources WHERE id = ?',
        args: [sourceId]
      });
      const currentEtag = sourceQuery.rows[0]?.etag as string | null;
      
      const result = await this.registryService.syncFromHttp(sourceId, registry.url, currentEtag);
      
      if (result.status === 200 && result.etag) {
        await this.db.execute({
          sql: 'UPDATE sources SET etag = ?, last_synced_at = ? WHERE id = ?',
          args: [result.etag, new Date().toISOString(), sourceId]
        });
      } else if (result.status === 304) {
          await this.db.execute({
            sql: 'UPDATE sources SET last_synced_at = ? WHERE id = ?',
            args: [new Date().toISOString(), sourceId]
          });
      }
    } else if (registry.type === 'git') {
      const localPath = await this.gitService.sync(registry.url);
      await this.registryService.syncFromLocalPath(sourceId, localPath);
    }
  }
}
