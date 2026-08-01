import { PolicyEngine } from './packages/superconductor-core/dist/permissions/engine.js';
import { TrackStateManager } from './packages/superconductor-core/dist/permissions/track-state.js';
const state = new TrackStateManager('/tmp/workspace');
state.detectCurrentState = () => 'TRACKED';
const engine = new PolicyEngine(state);
engine.setActiveManifest({
  capabilities: { fs_outside_root: false },
  allowlist: {}
});
console.log("View file inside workspace:", engine.isToolCallPermitted('view_file', { AbsolutePath: '/tmp/workspace/file.txt' }));
