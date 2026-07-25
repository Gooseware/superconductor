# Specification: Job Board Integration

## Overview
Implement a native "Job Board" backlog mechanism within the Superconductor ecosystem. Instead of specifying track details via chat, users or other systems can append tasks to a `superconductor/backlog.md` file. A Dispatcher agent will read this file, extract items, and convert them into isolated active tracks using `git worktree`.

## Functional Requirements
- **FR-1:** Engine supports parsing a `superconductor/backlog.md` file formatted as a list of markdown checkboxes (e.g., `- [ ] Feature: Add user avatars`).
- **FR-2:** Implement a Job Dispatcher module (invoked via a CLI command e.g., `superconductor dispatch` or as a daemon) that reads pending tasks from the backlog and automatically generates Track ID and specifications using a local agent run.
- **FR-3:** When a track is generated, the Dispatcher creates a dedicated isolated environment (e.g., using `git worktree`) to run the track.
- **FR-4:** Once the job finishes and is merged or queued for review, the Dispatcher checks off the item in `backlog.md`.

## Out of Scope
- Integration with external tracking tools like Jira or GitHub Issues.
- Ephemeral preview deployments.
