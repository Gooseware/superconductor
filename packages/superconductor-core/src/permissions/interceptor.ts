import { TrackStateManager } from './track-state.js';
import { PolicyEngine } from './engine.js';
import { PermissionManifest, PermissionState } from './schemas.js';
import * as fs from 'fs';
import * as path from 'path';
import { PermissionManifestParser } from './providers/toml-provider.js';

import { InlineOverrideHandler } from './prompter.js';
import { YoloAuditLogger } from './audit.js';

export class ToolCallInterceptor {
    private auditLogger: YoloAuditLogger;
    constructor(
        private stateManager: TrackStateManager,
        private policyEngine: PolicyEngine,
        private workspacePath: string,
        private overrideHandler?: InlineOverrideHandler
    ) {
        this.auditLogger = new YoloAuditLogger(workspacePath);
    }
    private getManifest(trackId: string): PermissionManifest | null {
        const manifestPath = path.join(this.workspacePath, 'superconductor', 'tracks', trackId, 'permission-manifest.toml');
        const parser = new PermissionManifestParser(manifestPath);
        return parser.read();
    }

    async intercept(toolName: string, args: any, manifest?: PermissionManifest): Promise<{ allowed: boolean, reason?: string }> {
        // Global block against modifying yolo-audit.log
        if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
            const targetFile = args?.path || args?.TargetFile || '';
            const resolved = path.resolve(targetFile);
            if (resolved.endsWith('yolo-audit.log')) {
                return { allowed: false, reason: 'Security: Modification of yolo-audit.log is strictly prohibited' };
            }
        }
        if (toolName === 'run_command') {
            const cmd = args?.command || args?.CommandLine || '';
            if (cmd.includes('yolo-audit.log') || cmd.includes('superconductor/logs') || /yolo-audit/.test(cmd) || /logs?\*/.test(cmd)) {
                return { allowed: false, reason: 'Security: Shell access to yolo-audit.log or logs directory is strictly prohibited' };
            }
        }

        const state = this.stateManager.detectCurrentState();

        if (state === 'IDLE') {
            if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
                const targetFile = args?.path || args?.TargetFile || '';
                const resolved = path.resolve(targetFile);
                if (
                    resolved.endsWith(path.join('superconductor', 'tracks.md')) || 
                    resolved.endsWith('permission-manifest.toml') ||
                    resolved.includes(path.join('.gemini', 'plugins', 'superconductor', 'skills'))
                ) {
                    return { allowed: false, reason: 'IDLE mode spoofing protection: cannot modify tracks.md or permission-manifest.toml' };
                }
            }
            if (toolName === 'run_command') {
                const cmd = args?.command || args?.CommandLine || '';
                // For shell commands we cannot perfectly resolve paths, but we must block typical bypasses
                // This is a defense in depth since the shell can use 'cd' etc.
                if (cmd.includes('tracks.md') || cmd.includes('permission-manifest.toml') || cmd.includes('superconductor')) {
                    return { allowed: false, reason: 'IDLE mode spoofing protection: cannot modify sensitive state files via shell' };
                }
            }
            return { allowed: true };
        }
        
        if (state === 'YOLO') {
            this.auditLogger.logToolCall(toolName, args, 'session-yolo');
            return { allowed: true };
        }

        if (state === 'TRACKED') {
            const trackId = this.stateManager.getActiveTrackId();
            if (manifest) {
                this.policyEngine.setActiveManifest(manifest);
                let isPermitted = this.policyEngine.isToolCallPermitted(toolName, args);
                
                if (isPermitted) {
                    // Consume ephemeral allow if it was used to permit this call
                    const argsHash = this.policyEngine.hashString(JSON.stringify(args));
                    this.policyEngine.clearEphemeralAllow(toolName, argsHash);
                } else if (!isPermitted && this.overrideHandler) {
                    const choice = await this.overrideHandler.handleBlockedCall(toolName, args);
                    if (choice === 'allow_once' || choice === 'allow_track' || choice === 'yolo_session') {
                        isPermitted = true;
                        if (choice === 'allow_once') {
                            const argsHash = this.policyEngine.hashString(JSON.stringify(args));
                            this.policyEngine.clearEphemeralAllow(toolName, argsHash);
                        }
                    }
                }
                
                return { allowed: isPermitted, reason: isPermitted ? undefined : 'denied by policy' };
            }
        }

        return { allowed: false, reason: 'unhandled state or missing manifest' };
    }
}
