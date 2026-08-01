import { TrackStateManager } from './track-state';
import { PolicyEngine } from './engine';
import { PermissionManifest, PermissionState } from './schemas';
import * as fs from 'fs';
import * as path from 'path';

export class ToolCallInterceptor {
    constructor(
        private stateManager: TrackStateManager,
        private policyEngine: PolicyEngine,
        private workspacePath: string
    ) {}

    private getManifest(trackId: string): PermissionManifest | null {
        const manifestPath = path.join(this.workspacePath, 'superconductor', 'tracks', trackId, 'permission-manifest.toml');
        // A minimal implementation for the test / Phase 2, in real world we'd parse TOML
        return null;
    }

    async intercept(toolName: string, args: any, manifest?: PermissionManifest): Promise<{ allowed: boolean, reason?: string }> {
        const state = this.stateManager.detectCurrentState();

        if (state === 'IDLE' || state === 'YOLO') {
            return { allowed: true };
        }

        if (state === 'TRACKED') {
            const trackId = this.stateManager.getActiveTrackId();
            if (manifest) {
                return this.policyEngine.evaluate(toolName, args, manifest);
            }
        }

        return { allowed: false, reason: 'unhandled state or missing manifest' };
    }
}
