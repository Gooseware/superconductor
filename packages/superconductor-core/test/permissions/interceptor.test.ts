import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolCallInterceptor } from '../../src/permissions/interceptor';
import { TrackStateManager } from '../../src/permissions/track-state';
import { PolicyEngine } from '../../src/permissions/engine';

describe('ToolCallInterceptor', () => {
    let stateManager: TrackStateManager;
    let policyEngine: PolicyEngine;
    let interceptor: ToolCallInterceptor;

    beforeEach(() => {
        stateManager = {
            detectCurrentState: vi.fn(),
            getActiveTrackId: vi.fn()
        } as unknown as TrackStateManager;
        
        policyEngine = {
            isToolCallPermitted: vi.fn(),
            setActiveManifest: vi.fn(),
            clearEphemeralAllow: vi.fn(),
            hashString: vi.fn().mockReturnValue('testhash')
        } as unknown as PolicyEngine;
        
        interceptor = new ToolCallInterceptor(stateManager, policyEngine, '/test/workspace');
    });

    it('should allow all tool calls when in IDLE mode', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('IDLE');
        
        const result = await interceptor.intercept('write_file', { path: '/tmp/test' });
        
        expect(result.allowed).toBe(true);
        expect(policyEngine.isToolCallPermitted).not.toHaveBeenCalled();
    });

    it('should delegate to PolicyEngine when in TRACKED mode', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('TRACKED');
        vi.mocked(stateManager.getActiveTrackId).mockReturnValue('track-123');
        const manifest = { capabilities: { arbitrary_shell: false } };
        vi.mocked(policyEngine.isToolCallPermitted).mockReturnValue(false);
        
        const result = await interceptor.intercept('run_command', { command: 'rm -rf /' }, manifest as any);
        
        expect(result.allowed).toBe(false);
        expect(policyEngine.setActiveManifest).toHaveBeenCalledWith(manifest);
        expect(policyEngine.isToolCallPermitted).toHaveBeenCalledWith('run_command', { command: 'rm -rf /' });
    });
});
