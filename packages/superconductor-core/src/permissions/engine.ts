import { TrackStateManager } from './track-state.js';
import { PermissionManifest } from './schemas.js';

export class PolicyEngine {
  private stateManager: TrackStateManager;
  private activeManifest: PermissionManifest | null = null;
  private ephemeralAllows: Set<string> = new Set(); // e.g. "run_shell_command:lsusb"

  constructor(stateManager: TrackStateManager) {
    this.stateManager = stateManager;
  }

  public setActiveManifest(manifest: PermissionManifest | null) {
    this.activeManifest = manifest;
  }

  public getActiveManifest(): PermissionManifest | null {
    return this.activeManifest;
  }

  public grantEphemeralAllow(toolName: string, argsHash: string) {
    this.ephemeralAllows.add(`${toolName}:${argsHash}`);
  }

  public clearEphemeralAllow(toolName: string, argsHash: string) {
    this.ephemeralAllows.delete(`${toolName}:${argsHash}`);
  }

  public isToolCallPermitted(toolName: string, args: Record<string, any>): boolean {
    const state = this.stateManager.detectCurrentState();
    
    // Layer 1: Base (IDLE Mode removes all restrictions according to FR-1)
    if (state === 'IDLE') return true;

    // Layer 3: YOLO (Global override removes all restrictions according to FR-3)
    if (state === 'YOLO') return true;

    // Ephemeral Override Check
    const argsStr = JSON.stringify(args);
    const argsHash = this.hashString(argsStr);
    if (this.ephemeralAllows.has(`${toolName}:${argsHash}`)) {
      return true;
    }

    // Layer 2: Track Manifest Evaluation
    if (state === 'TRACKED') {
      if (!this.activeManifest) {
        // If no manifest is loaded, default deny for restricted capabilities
        return false;
      }

      const caps = this.activeManifest.capabilities;

      if (toolName === 'run_shell_command') {
        const cmd = args.command as string || '';
        
        // Check arbitrary shell
        if (caps.arbitrary_shell) return true;

        // Check usb_access
        if (cmd.includes('lsusb') || cmd.includes('udevadm')) {
          return caps.usb_access;
        }

        // Check allowlist shell_prefixes
        const allowedPrefixes = this.activeManifest.allowlist?.shell_prefixes || [];
        if (allowedPrefixes.some((prefix: string) => cmd.startsWith(prefix))) {
          return true;
        }

        // Add more default denials for shell commands if not in allowlist
        return false;
      }

      if (toolName === 'read_url_content' || toolName === 'search_web') {
        return caps.network_unrestricted;
      }
      
      if (toolName === 'write_to_file' || toolName === 'replace_file_content') {
         // Check fs_outside_root if path is outside workspace
         // Assuming absolute paths are provided in args.TargetFile or similar.
         // This is a simplified check.
         const targetFile = args.TargetFile || args.AbsolutePath || '';
         if (targetFile.includes('..') || targetFile.startsWith('/tmp')) {
           return caps.fs_outside_root;
         }
      }

      // Default allow for tools that don't hit restricted capabilities
      return true;
    }

    return false;
  }

  private hashString(str: string): string {
    // Simple hash for ephemeral caching
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString();
  }
}
