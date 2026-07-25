# Track Specification: Dependency Functional Surface Intelligence

## Overview
This track enhances the Superconductor intelligence engine to map the functional surface of third-party dependencies (`node_modules`) and internal packages. By generating a lazy-loaded "Usage Heatmap" and offering deterministic dependency-surface analysis, agents can make token-efficient decisions to build Anti-Corruption Layers (Adapters) rather than rewriting massive swaths of the codebase when dependencies are replaced or patched.

## Research Notes
- **Codebase Knowledge Graphs:** Modern agentic tools use graph databases or memory-efficient AST parsers to represent a codebase's functional surface rather than raw dependency trees.
- **Token Context Engineering:** Exposing AST/Graph data directly into LLM context windows causes token bloat and OOM constraints. Instead, this intelligence must be exposed as discrete tools (MCP) so agents can query the "blast radius" only when needed.
- **Agentic Governance:** Explicitly bounding which dependencies an agent can refactor prevents sprawl and silent degradation.

## Architectural Committee Recommendations
- **Engine:** Use a fast parser (e.g. `swc`, `oxc`, or IDE LSP integrations) instead of the TS Compiler API to avoid OOM crashes.
- **Lazy Evaluation:** Map only explicitly imported surfaces from `node_modules` instead of traversing entire dependency trees.
- **Lazy Context Loading:** Expose the functional surface map as a discrete tool (`get_dependency_surface`) rather than proactively injecting it into the `builder.ts` prompt context.
- **Adapter Generation Rules:** Superconductor can suggest local Adapters to patch dependencies *only* if the token economics favor it, and *only* for pure functional dependencies. Adapters must be marked as technical debt and require re-verification when upstream packages are bumped.

## Functional Requirements
1. **Functional Surface AST Parser:** Integrate a fast AST parser to map explicit imports and functional surface calls for external and internal dependencies.
2. **Usage Heatmap Generator:** Build a lightweight JSON structure (e.g., `08_dependency_surface.json`) that catalogs which specific functions/classes from a dependency are used in which local files.
3. **Agent MCP Tooling:** Create a new tool (e.g., `get_dependency_surface`) that allows subagents to query the dependency heatmap dynamically without context bloat.
4. **Adapter Generation Heuristics:** Update `SwarmBlueprintGenerator` or related planners to evaluate the heatmap's "blast radius" and recommend generating an Anti-Corruption Layer (Adapter) if it reduces token costs vs a full rewrite.

## Non-Functional Requirements
- **Performance:** Parsing must be exceptionally fast and strictly lazy; the parser must not crash or degrade IDE performance on massive `node_modules` folders.
- **Security:** Ensure generated adapters include metadata to alert users if the upstream package versions change.

## Acceptance Criteria
- [ ] The intelligence snapshot generates a functional surface heatmap for imported dependencies.
- [ ] Agents can successfully query the usage heatmap via a discrete tool without it being injected into all prompts by default.
- [ ] The swarm correctly suggests generating an Adapter pattern instead of a full rewrite when a highly-coupled dependency's functionality needs modification.

## Out of Scope
- Building our own custom AST parser from scratch.
- Real-time deep analysis of entire `node_modules` packages (must remain lazy).
