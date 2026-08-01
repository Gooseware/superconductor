import { TrackStateManager } from './track-state.js';
import { PolicyEngine } from './engine.js';
import { PermissionManifest, PermissionState } from './schemas.js';
import * as fs from 'fs';
import * as path from 'path';

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
        // A minimal implementation for the test / Phase 2, in real world we'd parse TOML
        return null;
    }

    async intercept(toolName: string, args: any, manifest?: PermissionManifest): Promise<{ allowed: boolean, reason?: string }> {
        // Global block against modifying yolo-audit.log
        if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
            const targetFile = args?.path || args?.TargetFile || '';
            if (targetFile.includes('yolo-audit.log')) {
                return { allowed: false, reason: 'Security: Modification of yolo-audit.log is strictly prohibited' };
            }
        }
        if (toolName === 'run_command' && args?.command?.includes('yolo-audit.log')) {
            return { allowed: false, reason: 'Security: Shell access to yolo-audit.log is strictly prohibited' };
        }

        const state = this.stateManager.detectCurrentState();

        if (state === 'IDLE') {
            if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
                const targetFile = args?.path || args?.TargetFile || '';
                if (targetFile.includes('/superconductor/tracks.md') || targetFile.includes('permission-manifest.toml')) {
                    return { allowed: false, reason: 'IDLE mode spoofing protection: cannot modify tracks.md or permission-manifest.toml' };
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
                    }
                }
                
                return { allowed: isPermitted, reason: isPermitted ? undefined : 'denied by policy' };
            }
        }

        return { allowed: false, reason: 'unhandled state or missing manifest' };
    }
}
