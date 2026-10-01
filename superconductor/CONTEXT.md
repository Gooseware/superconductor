# Superconductor Ubiquitous Language (CONTEXT.md)

## Core Terms

| Term | Definition |
|------|-----------|
| **Track** | A single unit of work with spec.md and plan.md; analogous to a feature branch |
| **Swarm** | A coordinated set of specialized AI subagents working in parallel |
| **Orchestrator** | The parent agent managing swarm lifecycle and state |
| **Remediator** | A domain-specialized subagent that applies code fixes |
| **Finding** | A code issue identified by the review pipeline (severity + file + rule) |
| **Domain** | A logical grouping of files (auth, ui, db, api, tests) mapped to a remediator type |
| **BiasIsolation** | Ensuring fresh reviewers receive no prior reviewer reasoning |
| **FSM** | Finite State Machine governing the remediation lifecycle |
| **Deep Research** | Tier-4 research capability invoked when swarm retries are exhausted |
| **RepoContext** | Intelligence snapshot providing hotspot scores and SAST findings |
| **Quorum** | Consensus state where all reviewers report RESOLVED |
| **MockStoryEnvelope** | In-memory auto-synthesized test harness wrapping UI components in mock providers and fixtures |
| **MockScenarioAdapter** | Multi-source mock driver switching previews between synthetic, seed, edge-case, and snapshot states |
| **InDomProposal** | Ephemeral in-memory JSX/CSS patch hot-injected into preview DOM via Vite HMR before disk commits |
| **TokenSynthesizer** | Visual scanner extracting raw styling into a 4-tier semantic token catalog (Surfaces, Typography, State, Geometry) |
| **LocaleMirrorHarness** | Multi-language and bidirectional LTR/RTL environment simulator testing text expansion and layout mirroring |
| **LayeredAssemblyPartitioning** | Note clustering strategy grouping feedback by editing hierarchy into foundational token tracks and downstream feature waves |
| **SurfaceAdapter** | Pluggable interface abstracting visual preview runtimes (Web Component core, with extension hooks for CLI/Image) |
