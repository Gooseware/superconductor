# Implementation Plan: Centralize Component Publishing

## Phase 0: Proactive Abstractions (Oracle Suggestions) [checkpoint: 1484c18]
- [x] Task: Create `ComponentPayload` schema/interface to standardize the payload sent from Superconductor to Design OS (including `files`, `metadata`, `comments`, and `dependencies`) 8f5a8ad
- [x] Task: Implement `DesignOSRegistryClient` in Superconductor to abstract the MCP tool invocation and handle error resilience. 45c9f96
- [x] Task: Implement an atomic Git operations utility in the `design_os` repository to safely handle pulling, staging, committing, and pushing concurrently received files and database updates. 5d3ae00
- [x] Task: Superconductor - User Manual Verification 'Phase 0: Proactive Abstractions' (Protocol in workflow.md) 1484c18

## Phase 1: Design OS Kernel Enhancements & Commenting
- [x] Task: Setup the testing and development context within the `/home/gooseware/repos/hippos/design_os` repository. 5d3ae00
- [x] Task: Implement a new MCP tool (e.g., `publish_vetted_component`) in `design-os-kernel` that accepts the `ComponentPayload`. 85ea8d4
- [x] Task: Implement a commenting system within `design-os-kernel` to store and retrieve comments in component metadata files or a centralized JSON registry. 85ea8d4
- [x] Task: Integrate the atomic Git utility within the MCP tools to ensure the centralized registry stays continuously synced. 85ea8d4
- [x] Task: Superconductor - User Manual Verification 'Phase 1: Design OS Kernel Enhancements & Commenting' (Protocol in workflow.md)

## Phase 4: Multi-Registry Infrastructure (Added)
- [x] Task: Update `ConfigSchema` to include `isDefaultPublishTarget` and `localPath` for registries. 85ea8d4
- [x] Task: Update default `REGISTRY_REPO_PATH` to `~/.design_os/registry` in `index.ts`. 85ea8d4
- [x] Task: Implement one-time migration from local `packages/ui-kit-registry` to `~/.design_os/registry`. 85ea8d4
- [x] Task: Update `CentralizedPublishService` to support multiple registry targets. 85ea8d4

## Phase 5: Dynamic Registry Management (Added)
- [x] Task: Implement MCP tools: `add_registry`, `list_registries`, `switch_active_registry`. 85ea8d4
- [x] Task: Enhance `SyncManager` to manage multiple local Git clones for registries. 85ea8d4

## Phase 2: Superconductor Integration [checkpoint: ]
- [x] Task: Update the Phase Completion Protocol (in integration files) to use `DesignOSRegistryClient` instead of writing to local `packages/ui-kit-registry`.
- [x] Task: Update the Oracle Code Review Loop to utilize the new centralized publishing mechanism for any suggested abstractions.
- [x] Task: Superconductor - User Manual Verification 'Phase 2: Superconductor Integration' (Protocol in workflow.md)

## Phase 3: Database Discovery & Migration [checkpoint: ]
- [x] Task: Create a script/task `migrate_local_registry` in Superconductor. 
- [x] Task: Implement logic within the script to locate the existing local component database/registry in the current project.
- [x] Task: Parse the local database, extract all existing components and metadata, and sequentially push them to the centralized repository using the `DesignOSRegistryClient`.
- [x] Task: Superconductor - User Manual Verification 'Phase 3: Database Discovery & Migration' (Protocol in workflow.md)