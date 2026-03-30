# Product Definition

## Vision
Conductor is a Gemini CLI extension that enables **Context-Driven Development**, turning the Gemini CLI into a proactive project manager that follows a strict protocol to specify, plan, and implement software. It aims to supercharge the development lifecycle by incorporating "superpowers" and advanced tool use, such as the `design-os-kernel` MCP tool for vetted components and expert `code review` skills to ensure all code meets rigorous project standards.

## Target Audience
- **Individual Developers:** Those seeking a disciplined, high-quality workflow.
- **Development Teams:** Groups requiring shared context, standards, and collaborative project management.
- **Project Leads/Architects:** Users who want to easily set up and manage AI-driven projects with a single source of truth.

## Goals
1. **Enforce Lifecycle:** Ensure every task has a clear specification and plan before any code is written (**Context -> Spec & Plan -> Implement**).
2. **Maintain Context:** Provide a shared source of truth for all agent interactions, ensuring consistent project awareness.
3. **Safely Iterate:** Facilitate safe code changes through structured reviews, reverts, and manual verification steps.
4. **Leverage Vetted Components:** Integrate with `design-os-kernel` to utilize a library of high-quality, pre-tested UI components and logic.
5. **Ensure Standards:** Use specialized code review skills and standardized tech stacks to maintain consistency across different projects and teams.

## Key Features
- **Scaffolding/Setup:** Commands (`/conductor:setup`) to initialize and configure the project context (product, guidelines, tech stack, workflow).
- **Track Management:** Automated generation of task-specific specifications and actionable plans (`/conductor:newTrack`).
- **Implement Workflow:** An agent-led implementation loop (`/conductor:implement`) that follows defined workflows (e.g., TDD) and provides manual verification checkpoints.
- **Standardized Tech Stacks:** A library of pre-defined, high-quality technology stacks that users can choose from based on their specific requirements.
- **Broader Ecosystem Integration:** Hooks and integrations for common external tools and a broader development ecosystem.

## Success Metrics
- Reduction in "drift" between implementation and project goals.
- Increased consistency in code quality and adherence to style guides.
- Improved developer productivity through automated planning and context management.
