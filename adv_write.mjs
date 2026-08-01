import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
import path from 'path';
const state = new TrackStateManager('/tmp/workspace');
state.currentState = 'TRACKED'; 
// Wait, currentState is private, I'll use detectCurrentState mocking.
state.detectCurrentState = () => 'TRACKED';
const engine = new PolicyEngine(state);
engine.setActiveManifest({
  capabilities: { fs_outside_root: false, fs_read: true, fs_write: true },
  allowlist: {}
});
console.log("Write inside workspace:", engine.isToolCallPermitted('write_file', { TargetFile: '/tmp/workspace/file.txt' }));
console.log("Write outside workspace:", engine.isToolCallPermitted('write_file', { TargetFile: '/etc/passwd' }));
