import { TrackStateManager } from './track-state.js';
import { YoloAuditLogger } from './audit.js';
import { PolicyEngine } from './engine.js';
import { KeywordPermissionInferrer } from './keyword-inferrer.js';
import { PermissionManifestParser } from './providers/toml-provider.js';
import * as fs from 'fs';
import * as path from 'path';

export type InlineOverrideChoice = 'allow_once' | 'allow_track' | 'yolo_session' | 'deny';

export class InlineOverrideHandler {
    private askUserImpl: (opts: { prompt: string, options: string[] }) => Promise<string>;

    constructor(
        private stateManager: TrackStateManager,
        private auditLogger: YoloAuditLogger,
        private policyEngine: PolicyEngine,
        private workspacePath: string
    ) {
        // Default askUser implementation throws, should be overridden or injected
        this.askUserImpl = async () => { throw new Error('No UI prompt registered'); };
    }

    public setAskUserImpl(impl: (opts: { prompt: string, options: string[] }) => Promise<string>) {
        this.askUserImpl = impl;
    }

    public async handleBlockedCall(toolName: string, args: Record<string, any>): Promise<InlineOverrideChoice> {
        // Prepare options
        const options = ['allow_once', 'allow_track', 'yolo_session', 'deny'];
        const promptText = `Tool call blocked by policy: ${toolName}\nArgs: ${JSON.stringify(args)}\nSelect override action:`;

        const promptPromise = this.askUserImpl({ prompt: promptText, options });
        
        let timeoutId: NodeJS.Timeout;
        // 60-second timeout
        const timeoutPromise = new Promise<string>((resolve) => {
            timeoutId = setTimeout(() => resolve('timeout_deny'), 60000);
        });

        const choice = await Promise.race([promptPromise, timeoutPromise]) as InlineOverrideChoice | 'timeout_deny';
        clearTimeout(timeoutId!);

        if (choice === 'timeout_deny') {
            this.auditLogger.init();
            this.auditLogger.logOverride('timeout_deny', toolName, args);
            return 'deny';
        }

        if (choice === 'allow_once') {
            const argsStr = JSON.stringify(args);
            const argsHash = this.policyEngine.hashString(argsStr);
            this.policyEngine.grantEphemeralAllow(toolName, argsHash);
        } else if (choice === 'allow_track') {
            const manifest = this.policyEngine.getActiveManifest();
            if (manifest) {
                const inferred = KeywordPermissionInferrer.inferCapabilities(JSON.stringify(args));
                
                // Merge inferred capabilities
                manifest.capabilities.usb_access = manifest.capabilities.usb_access || inferred.usb_access;
                manifest.capabilities.arbitrary_shell = manifest.capabilities.arbitrary_shell || inferred.arbitrary_shell;
                manifest.capabilities.network_unrestricted = manifest.capabilities.network_unrestricted || inferred.network_unrestricted;
                manifest.capabilities.fs_outside_root = manifest.capabilities.fs_outside_root || inferred.fs_outside_root;

                const trackId = this.stateManager.getActiveTrackId();
                if (trackId) {
                    const manifestPath = path.join(this.workspacePath, 'superconductor', 'tracks', trackId, 'permission-manifest.toml');
                    const parser = new PermissionManifestParser(manifestPath);
                    parser.write(manifest);
                }
            }
        } else if (choice === 'yolo_session') {
            this.stateManager.setYolo(true);
        }

        this.auditLogger.init();
        this.auditLogger.logOverride(choice, toolName, args);

        return choice;
    }
}
