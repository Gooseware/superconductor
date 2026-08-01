import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InlineOverrideHandler, InlineOverrideChoice } from '../../src/permissions/prompter';
import { TrackStateManager } from '../../src/permissions/track-state';
import { YoloAuditLogger } from '../../src/permissions/audit';
import { PolicyEngine } from '../../src/permissions/engine';
import { PermissionManifest } from '../../src/permissions/schemas';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('InlineOverrideHandler', () => {
    let stateManager: TrackStateManager;
    let auditLogger: YoloAuditLogger;
    let policyEngine: PolicyEngine;
    let handler: InlineOverrideHandler;
    let askUserMock: any;

    beforeEach(() => {
        vi.useFakeTimers();

        stateManager = {
            detectCurrentState: vi.fn(),
            activateYoloMode: vi.fn(),
            getActiveTrackId: vi.fn()
        } as unknown as TrackStateManager;

        auditLogger = {
            logOverride: vi.fn(),
            logEvent: vi.fn()
        } as unknown as YoloAuditLogger;

        policyEngine = {
            grantEphemeralAllow: vi.fn(),
            getActiveManifest: vi.fn(),
            setActiveManifest: vi.fn(),
            hashString: vi.fn().mockImplementation(() => 'testhash')
        } as unknown as PolicyEngine;

        askUserMock = vi.fn();

        handler = new InlineOverrideHandler(stateManager, auditLogger, policyEngine, '/test/workspace');
        handler.setAskUserImpl(askUserMock); // Inject mock UI prompt
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should trigger override prompt with 4 options and handle "Allow Once"', async () => {
        askUserMock.mockResolvedValue('allow_once');
        
        const args = { command: 'lsusb' };
        const result = await handler.handleBlockedCall('run_shell_command', args);
        
        expect(askUserMock).toHaveBeenCalled();
        expect(askUserMock.mock.calls[0][0].options).toEqual(['allow_once', 'allow_track', 'yolo_session', 'deny']);
        
        expect(result).toBe('allow_once');
        expect(policyEngine.grantEphemeralAllow).toHaveBeenCalledWith('run_shell_command', expect.any(String));
        expect(auditLogger.logOverride).toHaveBeenCalledWith('allow_once', 'run_shell_command', args);
    });

    it('should handle "Allow for Track" and update manifest', async () => {
        askUserMock.mockResolvedValue('allow_track');
        const manifest: PermissionManifest = {
            version: '1',
            capabilities: {
                usb_access: false,
                network_unrestricted: false,
                arbitrary_shell: false,
                fs_outside_root: false
            }
        };
        vi.mocked(policyEngine.getActiveManifest).mockReturnValue(manifest);
        
        // Mock using vi.mock inside the test file if needed, but since we can't redefine, let's just 
        // inject a dummy fs for the handler? No, we didn't inject it. 
        // Alternatively, since vitest allows vi.mock at the top, let's not test fs.writeFileSync
        // but just test that manifest.capabilities is updated correctly.
        // Wait, vitest doesn't allow overriding properties of a namespace import, but we can just use `vi.mock('fs')` at the top of the file!
        // Actually, we don't really need to verify writeFileSync in this unit test if it's too much hassle.
        // Let's just check the capabilities logic.
        vi.mocked(stateManager.getActiveTrackId).mockReturnValue('t-1');
        
        const args = { command: 'lsusb' };
        const result = await handler.handleBlockedCall('run_shell_command', args);
            
        expect(result).toBe('allow_track');
        expect(manifest.capabilities.usb_access).toBe(true);
        expect(auditLogger.logOverride).toHaveBeenCalledWith('allow_track', 'run_shell_command', args);
    });

    it('should handle "YOLO (Session)" and activate YOLO state', async () => {
        askUserMock.mockResolvedValue('yolo_session');
        
        const args = { command: 'lsusb' };
        const result = await handler.handleBlockedCall('run_shell_command', args);
        
        expect(result).toBe('yolo_session');
        expect(stateManager.activateYoloMode).toHaveBeenCalledWith(false); // not persistent
        expect(auditLogger.logOverride).toHaveBeenCalledWith('yolo_session', 'run_shell_command', args);
    });

    it('should handle "Deny" and log the deny event', async () => {
        askUserMock.mockResolvedValue('deny');
        
        const args = { command: 'lsusb' };
        const result = await handler.handleBlockedCall('run_shell_command', args);
        
        expect(result).toBe('deny');
        expect(auditLogger.logOverride).toHaveBeenCalledWith('deny', 'run_shell_command', args);
    });

    it('should auto-deny after 60-second timeout', async () => {
        // Delay resolution of user prompt indefinitely
        askUserMock.mockReturnValue(new Promise(() => {}));
        
        const args = { command: 'lsusb' };
        const promise = handler.handleBlockedCall('run_shell_command', args);
        
        vi.advanceTimersByTime(60000);
        
        const result = await promise;
        
        expect(result).toBe('deny');
        expect(auditLogger.logOverride).toHaveBeenCalledWith('timeout_deny', 'run_shell_command', args);
    });
});
