# Specification: Token Estimation and Open Source Package Recommender

## Overview
This track introduces a comprehensive token estimation and package recommendation system for the Superconductor multi-agent architecture. It aims to optimize the token economy and reduce development costs by tracking token consumption granularly across all subagents and leveraging open-source packages whenever possible. To facilitate the latter, the planning agent will gain the ability to generate "Deep Research Prompt" artifacts, enabling either manual execution or automated deep research agents to identify and vet optimal packages for a given task.

## Architecture Committee Recommendations
- **Lifecycle Token Aggregator:** Track token usage in-memory via a subagent runtime wrapper and flush an aggregated `TokenUsageReport` to a centralized store at the end of the agent's lifecycle. This avoids I/O bottlenecks and latency.
- **Dependency Context Manager:** Implement a service that statically analyzes workspace manifests (e.g., `package.json`) to maintain a graph of currently available packages and prevent redundant dependencies.
- **Vetting Matrix Enforcement:** The Deep Research Prompt must strictly instruct the research agent to operate in a read-only capacity, producing a `PackageVettingMatrix` (detailing license compliance, CVEs, maintenance metrics, and bundle size) without executing arbitrary code or installations.

## Research Notes
- Multi-agent LLM systems consume exponentially more tokens due to iterative reasoning, making granular observability essential. Best practices suggest trace-level attribution (tagging spans with input/output tokens) rather than raw API limits.
- Context pressure and bloated history are major cost drivers; tracking token usage per subagent and step helps identify optimization opportunities.
- Relying on open-source packages is a primary way to save tokens that would otherwise be spent on custom implementation and repeated code reviews. 
- Evaluating packages must prioritize multiple factors simultaneously: community health (downloads, stars), performance (bundle size), and security (CVEs, provenance).

## Functional Requirements
1. **Granular Token Tracking:** The system must record token usage (prompt and completion tokens) at a granular level (per subagent, per tool, per step).
2. **Centralized Telemetry Store:** Implement a datastore or file-based telemetry registry to aggregate and sum token usage reports per track.
3. **Local Package Inventory Parser:** The system must automatically parse language-specific manifests (e.g., `package.json`, `go.mod`) to understand which dependencies are already available.
4. **Deep Research Prompt Generation:** The planning agent must be able to generate a standardized "Deep Research Prompt Artifact" containing the current dependency context and the target feature goal.
5. **Flexible Dispatch:** The system must support flexible execution of the generated prompt artifact, allowing the user to either manually hand it off to their preferred tool or have the system dispatch a built-in deep research agent.

## Non-Functional Requirements
- **Performance:** Token tracking must not introduce noticeable latency or I/O bottlenecks during swarm execution (must use batched/lifecycle flushing).
- **Security:** Deep research prompts must enforce read-only execution constraints to prevent supply-chain attacks.
- **Security:** Telemetry events must not leak sensitive prompt contents; only integer token counts and metadata should be transmitted.

## Acceptance Criteria
- [ ] A `TokenUsageReport` is successfully generated and stored at the end of each subagent's lifecycle.
- [ ] Token tracking accurately aggregates costs at the step, subagent, and total track level.
- [ ] A `DependencyContextManager` successfully parses a workspace manifest (e.g., `package.json`) and exposes the list of installed packages.
- [ ] The planning agent successfully generates a deep research prompt artifact instructing the evaluation of packages against community health, performance, and security criteria.
- [ ] The research prompt mandates a structured `PackageVettingMatrix` output.

## Out of Scope
- Building a custom external deep research engine from scratch (we will rely on existing agent capabilities or external handoff).
- Real-time token quota enforcement or hard limits that kill subagents mid-execution.
