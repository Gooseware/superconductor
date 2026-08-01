import * as fs from 'fs';
import { parse, stringify } from 'smol-toml';
import { PermissionManifest, PermissionManifestSchema, CapabilityFlags } from '../schemas.js';

export class PermissionManifestParser {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public read(): PermissionManifest | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = parse(content);
      const result = PermissionManifestSchema.parse(parsed);
      return result;
    } catch (e) {
      throw new Error(`Failed to parse permission manifest: ${(e as Error).message}`);
    }
  }

  public write(manifest: PermissionManifest): void {
    const tomlString = stringify(manifest as any);
    fs.writeFileSync(this.filePath, tomlString, 'utf-8');
  }

  public updateCapability(key: keyof CapabilityFlags, value: boolean): void {
    let manifest = this.read();
    if (!manifest) {
      throw new Error('Cannot update capability: manifest not found or invalid');
    }

    manifest.capabilities[key] = value;
    this.write(manifest);
  }
}
