# Product Definition

## Vision
Superconductor is a Gemini CLI extension that enables **Context-Driven Development**, turning the Gemini CLI into a proactive project manager that follows a strict protocol to specify, plan, and implement software. It aims to supercharge the development lifecycle by incorporating "superpowers" and advanced tool use, such as the `superconductor-kernel` MCP tool for vetted components and expert `code review` skills to ensure all code meets rigorous project standards.

## Target Audience
- **Individual Developers:** Those seeking a disciplined, high-quality workflow.
- **Development Teams:** Groups requiring shared context, standards, and collaborative project management.
- **Project Leads/Architects:** Users who want to easily set up and manage AI-driven projects with a single source of truth.

## Goals
1. **Enforce Lifecycle:** Ensure every task has a clear specification and plan before any code is written (**Context -> Spec & Plan -> Implement**).
2. **Maintain Context:** Provide a shared source of truth for all agent interactions, ensuring consistent project awareness.
3. **Safely Iterate:** Facilitate safe code changes through structured reviews, reverts, and manual verification steps.
4. **Leverage Vetted Components:** Integrate with `superconductor-kernel` to utilize a library of high-quality, pre-tested UI components and logic.
5. **Token Economics & Routing:** Intelligently manage context size, tool surfaces, and model selection to optimize cost and performance, dynamically escalating to frontier models only when necessary.
6. **Ensure Standards:** Use specialized code review skills and standardized tech stacks to maintain consistency across different projects and teams.
7. **Production-Grade Verification:** Enforce rigorous code quality with automated property-based testing (PBT), mutation testing, and headless VLM visual auditing to eliminate AI self-validation bias.
8. **Multi-Agent Swarm Orchestration:** Coordinate parallel specialized agents (Dreamer, Processor, Reviewer, Oracle) in an autonomous loop to build, critique, and finalize code with minimal human intervention.

## Key Features
- **Scaffolding/Setup:** Commands (`/superconductor:setup`) to initialize and configure the project context (product, guidelines, tech stack, workflow).
- **Track Management:** Automated generation of task-specific specifications and actionable plans (`/superconductor:newTrack`) enhanced by proactive best practices research and Architecture Committee debates.
- **Implement Workflow:** An agent-led implementation loop (`/superconductor:implement`) supporting both standard execution and multi-agent swarm orchestration.
- **Autonomous Swarm Loop:** Runs an autonomous code -> review -> code -> review -> oracle loop that resolves compilation and test issues without interrupting the user.
- **Reduced Human-in-the-Loop:** Automatically verifies intermediate milestones and only requests human review at the very start and end of track implementation.
- **Automated Git Workflow:** Seamless branch management from `main` and interactive merge target selection upon track completion.
- **Dynamic Deployment Discovery:** Automatically identifies build and deployment commands from the project configuration to suggest post-merge deployment.
- **Standardized Tech Stacks:** A library of pre-defined, high-quality technology stacks that users can choose from based on their specific requirements.
- **Broader Ecosystem Integration:** Hooks and integrations for common external tools, including Caduceus context injection and development skills.

## Success Metrics
- Reduction in "drift" between implementation and project goals.
- Increased consistency in code quality and adherence to style guides.
- Improved developer productivity through automated planning and context management.
