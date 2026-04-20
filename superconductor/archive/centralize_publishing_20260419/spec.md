# Specification: Centralize Component Publishing to Design OS Kernel

## Overview
Currently, the Superconductor system publishes newly created, vetted UI components to a project-local directory. This track updates Superconductor to use a centralized `design-os-kernel` MCP server located at `/home/gooseware/repos/hippos/design_os`. It also introduces a commenting system for components and migrates the local component database/registry into the centralized repository, enabling shared knowledge of vetted components via continuous Git syncs.

## Functional Requirements
1. **Centralized Publishing via MCP:**
   - Update Superconductor's Phase Completion Protocol and Oracle Code Review loops to stop writing component files directly to local project paths.
   - Modify publication logic to invoke an MCP tool provided by `design-os-kernel` with the vetted file contents and associated metadata.

2. **Design OS Kernel Enhancements & Commenting System:**
   - Add an MCP tool (e.g., `publish_vetted_component`) to `design-os-kernel` to receive, save, commit, and push new components to its repository.
   - Implement a commenting system allowing users/agents to attach, retrieve, and store comments for specific components within the centralized registry (e.g., within component metadata files).

3. **Database Migration & Registry Synchronization:**
   - Locate the existing local component database/registry within the current project.
   - Create a migration script to move this database and all existing components to the centralized `/home/gooseware/repos/hippos/design_os` repository.
   - Ensure the centralized registry acts as the single source of truth, updated continuously via Git operations, so all connected systems know exactly what has been vetted.

## Non-Functional Requirements
- **Consistency:** The integration must work hand-in-hand between Superconductor and Design OS.
- **Resilience:** The MCP tool call must handle network or execution failures gracefully and report them back to the user.
- **Traceability:** The publication process must log which project and phase the component originated from.

## Out of Scope
- Modifying how the actual UI components are written or tested (the process remains the same up until publication).