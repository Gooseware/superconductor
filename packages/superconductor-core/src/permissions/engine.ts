import { TrackStateManager } from './track-state.js';
import { PermissionManifest } from './schemas.js';
import * as path from 'path';

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

      if (toolName === 'run_command') {
        const cmd = args.CommandLine || args.command || '';
        
        // Check arbitrary shell
        if (caps.arbitrary_shell) return true;

        // Block shell metacharacters if arbitrary shell is not granted
        if (/[;|&$()<>\n`'"*?\[\]~]/.test(cmd)) {
          return false;
        }

        // Check usb_access
        if (/(^|\s)lsusb(\s|$)/.test(cmd) || /(^|\s)udevadm(\s|$)/.test(cmd)) {
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
      
      if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content' || toolName === 'view_file' || toolName === 'list_dir' || toolName === 'grep_search') {
         // Check fs_outside_root if path is outside workspace
         const targetFile = args.TargetFile || args.AbsolutePath || args.path || args.DirectoryPath || args.SearchPath || '';
         const workspacePath = path.resolve(this.stateManager['workspacePath']);
         const resolvedPath = path.resolve(targetFile);
         const relative = path.relative(workspacePath, resolvedPath);
         if (relative.startsWith('..') || path.isAbsolute(relative)) {
           return !!caps.fs_outside_root;
         }
         return true; // Path is safely inside workspace
      }

      // Default deny for unhandled tools to ensure strictly-scoped access
      return false;
    }

    return false;
  }

  public hashString(str: string): string {
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
