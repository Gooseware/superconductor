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
        // Global block against modifying yolo-audit.log, logs directory, or the superconductor root itself (all modes)
        if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content' || toolName === 'delete_file') {
            const targetFile = args?.path || args?.TargetFile || '';
            const resolved = path.resolve(this.workspacePath, targetFile);
            const logsDir = path.join(this.workspacePath, 'superconductor', 'logs');

            // Block access into logs dir (child or exact match)
            const relLogs = path.relative(logsDir, resolved);
            if (!relLogs.startsWith('..') && !path.isAbsolute(relLogs)) {
                return { allowed: false, reason: 'Security: Modification of logs directory is strictly prohibited' };
            }
            // REV-21: also block if resolved is an ancestor of logsDir.
            // path.relative(resolved, logsDir) not starting with '..' means resolved contains logsDir.
            const relAncestor = path.relative(resolved, logsDir);
            if (!relAncestor.startsWith('..') && !path.isAbsolute(relAncestor)) {
                return { allowed: false, reason: 'Security: Modification of logs directory is strictly prohibited' };
            }
        }
        if (toolName === 'run_command') {
            const cmd = args?.command || args?.CommandLine || '';
            // REV-22: block substring patterns regardless of tokenisation / chained cd bypasses
            if (cmd.includes('superconductor/logs') || cmd.includes('yolo-audit')) {
                return { allowed: false, reason: 'Security: Shell access to logs directory is strictly prohibited' };
            }
            // REV-22: reject any command that chains sub-commands (&&, ;, ||)
            if (/&&|;|\|\|/.test(cmd)) {
                return { allowed: false, reason: 'Security: Shell chaining operators (&&, ;, ||) are prohibited in run_command' };
            }
            // REV-20: block globbing, variables, backtick substitution, and brace expansion
            if (/[*?$[\]\\`{}|~<>]/.test(cmd)) {
                return { allowed: false, reason: 'Security: Bash globbing and variables are prohibited in run_command' };
            }
            const cwd = args?.Cwd || args?.cwd || this.workspacePath;
            const logsDir = path.join(this.workspacePath, 'superconductor', 'logs');
            
            const resolvedCwd = path.resolve(this.workspacePath, cwd);
            const relCwd = path.relative(logsDir, resolvedCwd);
            if (!relCwd.startsWith('..') && !path.isAbsolute(relCwd)) {
                return { allowed: false, reason: 'Security: Shell execution inside logs directory is strictly prohibited' };
            }

            const tokens = cmd.split(/\s+/);
            for (const token of tokens) {
                const cleanToken = token.replace(/['"]/g, '');
                if (!cleanToken || cleanToken.startsWith('-')) continue;
                const resolved = path.resolve(resolvedCwd, cleanToken);
                const rel = path.relative(logsDir, resolved);
                if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
                    return { allowed: false, reason: 'Security: Shell access to logs directory is strictly prohibited' };
                }
            }
        }

        const state = this.stateManager.detectCurrentState();

        if (state === 'IDLE') {
            if (toolName === 'write_file' || toolName === 'replace_file_content' || toolName === 'multi_replace_file_content' || toolName === 'delete_file') {
                const targetFile = args?.path || args?.TargetFile || '';
                const resolved = path.resolve(this.workspacePath, targetFile);
                
                const sensitivePaths = [
                    path.join(this.workspacePath, 'superconductor', 'tracks.md'),
                    path.join(this.workspacePath, 'superconductor', 'tracks'),
                    path.join(this.workspacePath, 'superconductor', 'session-flags.json'),
                    path.join(this.workspacePath, '.gemini', 'plugins', 'superconductor', 'skills')
                ];
                
                for (const sensitive of sensitivePaths) {
                    const relParent = path.relative(resolved, sensitive);
                    if (!relParent.startsWith('..') && !path.isAbsolute(relParent)) {
                        return { allowed: false, reason: 'IDLE mode spoofing protection: cannot modify sensitive state files' };
                    }
                    
                    const relChild = path.relative(sensitive, resolved);
                    if (!relChild.startsWith('..') && !path.isAbsolute(relChild)) {
                        return { allowed: false, reason: 'IDLE mode spoofing protection: cannot modify sensitive state files' };
                    }
                }
            }
            if (toolName === 'run_command') {
                return { allowed: false, reason: 'IDLE mode spoofing protection: run_command is blocked entirely in IDLE mode' };
            }
            return { allowed: true };
        }
        
        if (state === 'YOLO') {
            this.auditLogger.logToolCall(toolName, args, 'session-yolo');
            return { allowed: true };
        }

        if (state === 'TRACKED') {
            const trackId = this.stateManager.getActiveTrackId();
            let activeManifest = manifest;
            if (!activeManifest && trackId) {
                activeManifest = this.getManifest(trackId) || undefined;
            }
            if (activeManifest) {
                this.policyEngine.setActiveManifest(activeManifest);
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
