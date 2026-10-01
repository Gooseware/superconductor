# Track Specification: Seal Leaky Boundary Between Notebook Store & Core Services

## Overview
This track refactors the boundaries between the Notebook Store, Engine Events, and Core Services (Caching). It aims to eliminate direct coupling to raw database providers (like LanceDB or LibSQL) and encapsulate notebook query logic through a well-defined `NotebookQueryPort`.

## Architecture Committee Report
**Pattern:** Ports & Adapters (Hexagonal Architecture)
**Issue:** A high-churn coupling cluster has been identified (329 co-changes) across the notebook store, engine events, and core caching subsystems. Callers are currently binding directly to raw provider implementations (e.g., `LanceDbNotebookProvider`, `LibSqlNotebookProvider`). They manually orchestrate Reciprocal Rank Fusion (RRF) and token budget pruning across subsystem boundaries, which leaks LanceDB native dependencies and database schema specifics.
**Resolution:** Introduce an authoritative `NotebookQueryPort` in the notebook-store package. This port will encapsulate vector search, BM25 search, RRF fusion (`rrfMerge`), and token budget pruning (`applyTokenBudget`). We will implement both a production adapter (`LanceNotebookQueryAdapter`) and an isolated test adapter (`InMemoryNotebookQueryAdapter`). Core caches and event listeners must be decoupled to interact exclusively through this port contract.

## Functional Requirements
- **FR-1:** Define `NotebookQueryPort` interface in `packages/notebook-store/src/ports/`.
- **FR-2:** Encapsulate vector search, BM25 search, reciprocal rank fusion (`rrfMerge`), and token budget pruning (`applyTokenBudget`) within the query port.
- **FR-3:** Implement `LanceNotebookQueryAdapter` as the primary production adapter implementing `NotebookQueryPort`.
- **FR-4:** Implement `InMemoryNotebookQueryAdapter` as an isolated test adapter.

## Non-Functional Requirements
- **Backward Compatibility:** Maintain 100% backward compatibility for existing callers of `NotebookProviderFactory`.
- **Performance:** Ensure that RRF fusion and token pruning within the adapter do not introduce regressions in query latency.
- **Test Isolation:** The `InMemoryNotebookQueryAdapter` must provide full test isolation for consumers without relying on a real database instance.

## Acceptance Criteria
- **AC-1:** `NotebookQueryPort` is defined and exported from `@superconductor/notebook-store`.
- **AC-2:** `LanceNotebookQueryAdapter` successfully implements the port and integrates with the existing LanceDB setup.
- **AC-3:** `InMemoryNotebookQueryAdapter` successfully implements the port for testing purposes.
- **AC-4:** `semantic-cache` and `SuperconductorEventEmitter` are refactored to consume `NotebookQueryPort` instead of raw providers.
- **AC-5:** All existing tests pass, and backward compatibility is preserved via `NotebookProviderFactory`.

## Out of Scope
- Migrating other non-query functionalities to the ports & adapters pattern.
- Replacing LanceDB with a completely different vector database in production.
- Refactoring internal LanceDB schema.
