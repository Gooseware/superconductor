# Specification: Deepen or Inline Shallow CLI Wrappers

**Track ID:** `deepen_shallow_cli_facades_20261001`
**Title:** Deepen or Inline Shallow CLI Wrappers (`cli/index.ts`, `dispatcher.ts`, `phase-cli.ts`)
**Type:** Architecture Deepening / Deletion Test / Refactor

## Overview

The current CLI architecture in the Superconductor core suffers from shallow module fragmentation. The routing logic is spread thinly across `cli/index.ts`, `cli/dispatcher.ts`, and `cli/phase-cli.ts`. Navigating the CLI requires bouncing across multiple pass-through layers with near-zero internal cyclomatic depth. This track aims to apply the "Deletion Test" to these facades, replacing them with a deep, cohesive `SuperconductorCliDispatcher` class.

## Architecture Committee Report

- **Deletion Test Analysis:** `cli/dispatcher.ts` only branches on `--headless` vs `--interactive`. `cli/index.ts` contains a 330-line sprawling switch block with inline dynamic imports for various subcommands. `phase-cli.ts` exists as a completely detached sub-CLI parser with redundant error and prompt handling.
- **Locality & Leverage:** Fusing these disjointed scripts into a centralized `SuperconductorCliDispatcher` concentrates routing, option parsing, help text generation, and error handling into a single authoritative seam. This reduces cognitive overhead and increases the leverage of the CLI layer.

## Functional Requirements

- **FR-1:** Construct a deep `SuperconductorCliDispatcher` class that supports structured command registration, unified help/usage generation, consistent error boundaries, and environment detection (TTY vs headless vs CI).
- **FR-2:** Consolidate `phase-cli` handling as a first-class subcommand of the new dispatcher rather than treating it as a disconnected silo.
- **FR-3:** Inline the 330-line switch block from `cli/index.ts` into a maintainable, map-based or deeply structured router within the new dispatcher.
- **FR-4:** Re-export legacy functions (`runCli`, `runCliDispatcher`, `runPhaseCli`, and `CliDispatcher`) to ensure 100% backward compatibility for existing callers.

## Non-Functional Requirements

- **Backward Compatibility:** All existing integration points calling the CLI programmatically MUST continue to function without changes.
- **Performance:** Avoid eagerly loading heavy dependencies. Maintain the lazy-loading characteristics of the current dynamic imports for subcommands.
- **Error Isolation:** The unified dispatcher must consistently catch, log, and handle errors (e.g., throwing a `CliError` or returning structured exit codes).

## Acceptance Criteria

- **AC-1:** The `SuperconductorCliDispatcher` class is implemented with deep methods for routing, parsing, and execution.
- **AC-2:** The `phase` command is integrated cleanly into the main dispatcher, sharing the same error handling and argument parsing infrastructure.
- **AC-3:** `cli/index.ts`, `cli/dispatcher.ts`, and `cli/phase-cli.ts` contain NO core logic and only serve as thin backward-compatibility stubs exporting the legacy API.
- **AC-4:** Unit tests for `SuperconductorCliDispatcher` verify command execution, error catching, and help text formatting.
- **AC-5:** Integration tests verify the end-to-end CLI behavior (e.g., executing a command in headless vs interactive mode).

## Out of Scope

- Modifying the underlying behavior of the CLI subcommands (e.g., `orchestrate`, `review`, `status`). We are only refactoring the routing layer.
- Changing the output formats or exit codes of individual commands.
