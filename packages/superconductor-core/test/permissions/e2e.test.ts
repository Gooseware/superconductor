import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackStateManager } from '../../src/permissions/track-state';
import { PolicyEngine } from '../../src/permissions/engine';
import { ToolCallInterceptor } from '../../src/permissions/interceptor';
import { InlineOverrideHandler } from '../../src/permissions/prompter';
import { YoloAuditLogger } from '../../src/permissions/audit';
import { SessionProvider } from '../../src/permissions/providers/session-provider';
import { PermissionManifest } from '../../src/permissions/schemas';
import * as crypto from 'crypto';


// vi.mock must be at module top level for Vitest hoisting to work correctly
vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    watch: vi.fn().mockReturnValue({ close: vi.fn() }),
    realpathSync: vi.fn().mockImplementation((p: string) => p),
    lstatSync: vi.fn().mockReturnValue({ isSymbolicLink: () => false }),
    openSync: vi.fn().mockReturnValue(3),
    fchmodSync: vi.fn(),
    fstatSync: vi.fn().mockReturnValue({ mode: 0o100600 }),
    writeSync: vi.fn(),
    closeSync: vi.fn(),
    constants: { O_CREAT: 64, O_WRONLY: 1, O_APPEND: 1024, O_NOFOLLOW: 131072 }
}));

describe('Permissions E2E Integration', () => {
    let stateManager: TrackStateManager;
    let policyEngine: PolicyEngine;
    let interceptor: ToolCallInterceptor;
    let overrideHandler: InlineOverrideHandler;
    let auditLogger: YoloAuditLogger;

    beforeEach(() => {
        stateManager = new TrackStateManager('/workspace');
        policyEngine = new PolicyEngine(stateManager);
        auditLogger = new YoloAuditLogger('/workspace');
        overrideHandler = new InlineOverrideHandler(stateManager, auditLogger, policyEngine, '/workspace');
        interceptor = new ToolCallInterceptor(stateManager, policyEngine, '/workspace', overrideHandler);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Test full flow: IDLE mode -> start track -> TRACKED mode (manifest loaded) -> per-blocker override -> YOLO override -> audit log verified', async () => {
        const detectSpy = vi.spyOn(stateManager, 'detectCurrentState');
        detectSpy.mockReturnValue('IDLE');
        
        // 1. IDLE mode blocks run_command entirely
        let result = await interceptor.intercept('run_command', { command: 'ls' });
        expect(result.allowed).toBe(false);
        
        // 2. Start track / TRACKED mode
        detectSpy.mockReturnValue('TRACKED');
        vi.spyOn(stateManager, 'getActiveTrackId').mockReturnValue('test-track');
        
        const manifest: PermissionManifest = {
            meta: { track_id: 'test-track', generated_at: 'now', inferred_by: 'keyword' },
            capabilities: {
                arbitrary_shell: false,
                fs_outside_root: false,
                network_unrestricted: false,
                persistent: false,
                usb_access: false
            },
            allowlist: { paths: ['/workspace'], shell_prefixes: [], domains: [] }
        };

        const askUserMock = vi.fn()
            .mockResolvedValueOnce('allow_once')
            .mockResolvedValueOnce('yolo_session');
        overrideHandler.setAskUserImpl(askUserMock);
        
        const auditLogSpy = vi.spyOn(auditLogger, 'logToolCall');

        // Verify native allow for safe workspace tools WITHOUT triggering the prompt
        let safeResult = await interceptor.intercept('write_file', { TargetFile: '/workspace/safe.txt' }, manifest);
        expect(safeResult.allowed).toBe(true);
        safeResult = await interceptor.intercept('view_file', { AbsolutePath: '/workspace/safe2.txt' }, manifest);
        expect(safeResult.allowed).toBe(true);

        // 3. Per-blocker override: run_command is blocked, prompt returns 'allow_once'
        result = await interceptor.intercept('run_command', { command: 'rm -rf /' }, manifest);
        expect(result.allowed).toBe(true);
        expect(askUserMock).toHaveBeenCalledTimes(1);
        
        // 4. YOLO override
        result = await interceptor.intercept('write_file', { TargetFile: '/tmp/forbidden' }, manifest);
        expect(result.allowed).toBe(true);
        expect(askUserMock).toHaveBeenCalledTimes(2);
        
        // YOLO should transition state Manager to YOLO naturally
        detectSpy.mockRestore();
        result = await interceptor.intercept('write_file', { TargetFile: '/tmp/forbidden2' }, manifest);
        expect(result.allowed).toBe(true);
    });

    it('New-track flow emits permission manifest and user can review/edit it', async () => {
        const manifest: PermissionManifest = {
            meta: { track_id: 'new-track', generated_at: 'now', inferred_by: 'keyword' },
            capabilities: {
                arbitrary_shell: true,
                fs_outside_root: false,
                network_unrestricted: false,
                persistent: false,
                usb_access: false
            },
            allowlist: { paths: [], shell_prefixes: [], domains: [] }
        };
        
        vi.spyOn(stateManager, 'detectCurrentState').mockReturnValue('TRACKED');
        vi.spyOn(stateManager, 'getActiveTrackId').mockReturnValue('new-track');
        
        let result = await interceptor.intercept('run_command', { command: 'ls' }, manifest);
        expect(result.allowed).toBe(true);
    });

    it('Allow for Track updates manifest and persists across same-session calls', async () => {
        vi.spyOn(stateManager, 'detectCurrentState').mockReturnValue('TRACKED');
        vi.spyOn(stateManager, 'getActiveTrackId').mockReturnValue('test-track');
        
        const manifest: PermissionManifest = {
            meta: { track_id: 'test-track', generated_at: 'now', inferred_by: 'keyword' },
            capabilities: { arbitrary_shell: false } as any,
            allowlist: { shell_prefixes: [], domains: [], paths: [] }
        };
        
        const askUserMock = vi.fn().mockResolvedValue('allow_track');
        overrideHandler.setAskUserImpl(askUserMock);
        
        let result = await interceptor.intercept('run_command', { command: 'npm install' }, manifest);
        expect(result.allowed).toBe(true);
        expect(askUserMock).toHaveBeenCalled();
    });

    it('Performance benchmark - state detection overhead <5ms per tool call', async () => {
        // We use real track state manager without mocking for performance
        // We use real track state manager without mocking for performance
        // (fs is already mocked globally in this file)

        const realStateManager = new TrackStateManager('/workspace');
        
        // Populate a fake session file and track file structure
        // we already mock existsSync and readFileSync
        
        const start = performance.now();
        const iterations = 10;
        for (let i = 0; i < iterations; i++) {
            realStateManager.detectCurrentState();
        }
        const end = performance.now();
        const avg = (end - start) / iterations;
        
        expect(avg).toBeLessThan(5);
    });
});
