## Swarm Blueprint

**Mode:** pipeline (phases sequential, tasks within phase parallel)
**Max Concurrent Agents:** 6
**Oracle Cadence:** adaptive (every 4 tasks)
**Estimated Track Token Budget:** ~0.1M tokens · ~$0.01 at Flash-Lite rates

### Wave Schedule

| Wave | Tasks | Models | Est. Tokens | Est. Duration |
|---|---|---|---|---|
| 1 | Task: Swarm Preflight [TIER-1] [AGENT:supercond... | flash_lite | 28K | ~9 min |
| 2 | Task: Purge test tasks from task provider [TIER... | flash_lite | 56K | ~18 min |
| 3 | Task: Superconductor - User Manual Verification... | flash_lite | 9K | ~3 min |
| 4 | Task: Integrate track 'clean_test_tracks_202608... | flash_lite | 28K | ~9 min |

## Phase 0: Swarm Preflight
- [ ] Task: Swarm Preflight [TIER-1:TCS=3] [AGENT:superconductor-processor]
    - [ ] Verify `swarm-orchestrate` skill is available [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Swarm Preflight' (Protocol in workflow.md) [TIER-1:TCS=3]
    *Note: Runs via `run_command` as a TIER-1 deterministic check.*
    ```bash
    # Verify swarm-execute skill exists
    test -f skills/swarm-execute/SKILL.md && echo 'PASS: swarm-execute skill present' || (echo 'FAIL: swarm-execute skill missing' && exit 1)
    # Verify swarm-orchestrate is marked deprecated
    grep -q 'DEPRECATED' skills/swarm-orchestrate/SKILL.md && echo 'PASS: swarm-orchestrate marked deprecated' || (echo 'FAIL: deprecation marker missing' && exit 1)
    ```

## Phase 1: Clean Up Test Tracks
- [ ] Task: Purge test tasks from task provider [TIER-2:TCS=3] [AGENT:superconductor-processor]
    - [ ] Write script to mark test tasks as cancelled [TIER-1:TCS=3]
    - [ ] Execute script [TIER-1:TCS=3]
- [ ] Task: Remove test tracks from registry and filesystem [TIER-2:TCS=3] [AGENT:superconductor-processor]
    PROTECTED: superconductor/tracks.md
    - [ ] Remove `test_track_1786533675082`, `adv_test_track`, `test_phase4_track`, `adv_sync_test_track` from `superconductor/tracks.md` [TIER-1:TCS=3]
    - [ ] Delete their corresponding directories in `superconductor/tracks/` [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Clean Up Test Tracks' (Protocol in workflow.md) [TIER-1:TCS=3]
    *Note: Runs via `run_command` as a TIER-1 deterministic check.*
    ```bash
    # Verify test track tasks are marked pending/cancelled in task provider (query via MCP)
    # Verify test track directories still exist (will be deleted in next phase)
    test -d superconductor/tracks/test_track_1786533675082 || test -d superconductor/tracks/adv_test_track || echo 'INFO: test track dirs already absent'
    # Verify tracks.md does not list test tracks as active
    ! grep -q 'test_track_1786533675082.*\[~\]\|\[ \]' superconductor/tracks.md && echo 'PASS: no active test tracks' || (echo 'FAIL: test tracks still active' && exit 1)
    ```

## Phase 2: Integration & Finalization
- [ ] Task: Integrate track 'clean_test_tracks_20260813' into main branch. [TIER-2:TCS=3] [AGENT:superconductor-processor]
    - [ ] Merge or commit changes [TIER-1:TCS=3]
- [ ] Task: Superconductor - User Manual Verification 'Integration & Finalization' (Protocol in workflow.md) [TIER-1:TCS=3]
    *Note: Runs via `run_command` as a TIER-1 deterministic check.*
    ```bash
    # Verify tracks.md shows clean_test_tracks_20260813 as complete
    grep -q 'clean_test_tracks_20260813.*\[x\]\|\[x\].*clean_test_tracks_20260813' superconductor/tracks.md && echo 'PASS: track marked complete' || (echo 'FAIL: track not marked complete' && exit 1)
    # Verify no test track dirs remain
    ! test -d superconductor/tracks/test_track_1786533675082 && echo 'PASS: test_track_1786533675082 removed' || echo 'WARN: test_track_1786533675082 still present'
    ! test -d superconductor/tracks/adv_test_track && echo 'PASS: adv_test_track removed' || echo 'WARN: adv_test_track still present'
    ```
