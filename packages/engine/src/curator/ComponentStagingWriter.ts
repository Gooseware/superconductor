import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ComponentStagingManifest } from '../types/shared-schema.js';

export class ComponentStagingWriter {
  private stagingDir: string;

  constructor(stagingDir?: string) {
    this.stagingDir = stagingDir || path.join(os.homedir(), '.caduceus', 'staging');
  }

  /**
   * Writes component staging manifest to ~/.caduceus/staging/ atomically.
   * Fire-and-forget; never throws.
   */
  public async write(manifest: ComponentStagingManifest): Promise<boolean> {
    try {
      if (!fs.existsSync(this.stagingDir)) {
        fs.mkdirSync(this.stagingDir, { recursive: true, mode: 0o700 });
      }

      const filename = `${manifest.componentId}_${Date.now()}.json`;
      const finalPath = path.join(this.stagingDir, filename);
      const tempPath = `${finalPath}.${process.pid}.tmp`;

      fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
      fs.renameSync(tempPath, finalPath);

      return true;
    } catch {
      return false;
    }
  }
}
