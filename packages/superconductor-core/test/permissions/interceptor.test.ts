import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolCallInterceptor } from '../../src/permissions/interceptor';
import { TrackStateManager } from '../../src/permissions/track-state';
import { PolicyEngine } from '../../src/permissions/engine';

vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    realpathSync: vi.fn().mockImplementation((p: string) => p),
    lstatSync: vi.fn().mockReturnValue({ isSymbolicLink: () => false }),
    openSync: vi.fn().mockReturnValue(3),
    fchmodSync: vi.fn(),
    fstatSync: vi.fn().mockReturnValue({ mode: 0o100600 }),
    writeSync: vi.fn(),
    closeSync: vi.fn(),
    constants: { O_CREAT: 64, O_WRONLY: 1, O_APPEND: 1024, O_NOFOLLOW: 131072 }
}));

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

    it('write_file, run_shell_command, MCP calls all pass without prompt in IDLE state', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('IDLE');
        
        let result = await interceptor.intercept('write_file', { path: '/tmp/test' });
        expect(result.allowed).toBe(true);

        result = await interceptor.intercept('run_shell_command', { command: 'echo hello' });
        expect(result.allowed).toBe(true);

        result = await interceptor.intercept('mcp_call', { method: 'test' });
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

    it('should log tool calls to audit logger when in YOLO mode', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('YOLO');
        
        const fs = await import('fs');
        
        const result = await interceptor.intercept('danger_tool', { a: 1 });
        
        expect(result.allowed).toBe(true);
        expect(fs.writeSync).toHaveBeenCalled();
        // writeSync(fd, data) — check the data argument (index 1) contains the tool name
        const callArgs = vi.mocked(fs.writeSync).mock.calls[0];
        expect(String(callArgs[1])).toContain('danger_tool');
    });

    // REV-24: delete_file({}) must not be blocked by a false-positive ancestor check
    it('REV-24: delete_file with no path arg should be allowed in YOLO mode', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('YOLO');

        const result = await interceptor.intercept('delete_file', {});

        expect(result.allowed).toBe(true);
    });

    // REV-26: bare & (background-execution operator) must be blocked
    it('REV-26: run_command with bare & should be blocked', async () => {
        vi.mocked(stateManager.detectCurrentState).mockReturnValue('YOLO');

        const result = await interceptor.intercept('run_command', { CommandLine: 'rm file &' });

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('globbing');
    });
});
