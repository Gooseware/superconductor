# Agent Skills Catalog

This catalog defines the curriculum of skills available to the Superconductor extension and autonomous multi-agent swarm.

---

## 1. Core Lifecycle Skills
Fundamental skills that power the end-to-end Superconductor spec-driven lifecycle, command delegation, and track execution.

### setup
- **Description**: Scaffolds the project and sets up the Superconductor environment.
- **Path**: `skills/setup/SKILL.md`
- **Keywords**: `setup`, `initialize`, `scaffold`, `superconductor environment`

### new-track
- **Description**: Plans a track, generates track-specific spec documents (`spec.md`, `plan.md`), and updates the tracks registry.
- **Path**: `skills/new-track/SKILL.md`
- **Keywords**: `new track`, `plan track`, `create track`, `specification`

### implement
- **Description**: Executes the tasks defined in the specified track's plan using Test-Driven Development (TDD) and phase checkpoints.
- **Path**: `skills/implement/SKILL.md`
- **Keywords**: `implement`, `execute track`, `code generation`, `TDD`

### review
- **Description**: Reviews completed track work against guidelines, the tech stack, and the plan.
- **Path**: `skills/review/SKILL.md`
- **Keywords**: `review`, `code review`, `audit`, `plan verification`

### standalone-review
- **Description**: Runs the full heterogeneous Flash review panel (Security + Correctness + Adversarial + Regression) + Coverage Manifest + Residual Pass + Pro Arbiter against any code, diff, file, directory, or PR with zero track context.
- **Path**: `skills/standalone-review/SKILL.md`
- **Keywords**: `review`, `standalone review`, `quorum`, `pr review`, `diff review`

### standalone-remediation
- **Description**: Runs the Swarm Remediation Engine against an existing review report, spawning domain-specialized agents to fix findings with zero-bias re-review.
- **Path**: `skills/standalone-remediation/SKILL.md`
- **Keywords**: `remediation`, `fix findings`, `remediate review`, `domain remediation`

### status
- **Description**: Displays the current progress and status overview of the project tracks.
- **Path**: `skills/status/SKILL.md`
- **Keywords**: `status`, `progress`, `tracks overview`, `summary`

### revert
- **Description**: Reverts previous work (tracks, phases, tasks) with git history investigation and rollback safety.
- **Path**: `skills/revert/SKILL.md`
- **Keywords**: `revert`, `undo`, `git rollback`, `restore`

### triage
- **Description**: Ad-hoc issue triage — detect, assess scope (SMALL / MEDIUM / LARGE), and route to the correct remediation pipeline.
- **Path**: `skills/triage/SKILL.md`
- **Keywords**: `triage`, `bug fix`, `issue assessment`, `ad-hoc triage`

### models
- **Description**: Interactive Model Chooser dialog to configure role-to-model mappings and routing tiers across global, project, or session scopes.
- **Path**: `skills/models/SKILL.md`
- **Keywords**: `models`, `model chooser`, `routing tiers`, `role mapping`

### yolo
- **Description**: Activates YOLO mode to bypass permission boundaries with full audit logging.
- **Path**: `skills/yolo/SKILL.md`
- **Keywords**: `yolo`, `bypass permissions`, `override`, `audit log`

### swarm-execute
- **Description**: Executes the given track using the Swarm Orchestrator with implementors and quorum reviewers.
- **Path**: `skills/swarm-execute/SKILL.md`
- **Keywords**: `swarm-execute`, `swarm execution`, `orchestration`, `quorum review`

### batch-execute
- **Description**: Batch executes multiple tracks in dependency DAG order.
- **Path**: `skills/batch-execute/SKILL.md`
- **Keywords**: `batch-execute`, `multi-track`, `batch execution`, `dependency DAG`

### swarm-orchestrate
- **Description**: (DEPRECATED) Monolithic swarm orchestrator. Redirected to `skills/swarm-execute/SKILL.md`.
- **Path**: `skills/swarm-orchestrate/SKILL.md`
- **Keywords**: `swarm-orchestrate`, `deprecated`

---

## 2. Swarm Reviewer Personas & Agent Protocols
Specialized reviewer personas and multi-agent execution protocols for heterogeneous swarm quorum reviews.

### security-reviewer
- **Description**: Security-focused code reviewer for Superconductor track changes. Reviews for injection vulnerabilities, path traversal, insecure deserialization, authentication bypasses, and insecure default configurations.
- **Path**: `skills/security-reviewer/SKILL.md`
- **Keywords**: `security`, `sast`, `injection`, `vulnerability`, `cve`, `sanitization`

### correctness-reviewer
- **Description**: Correctness-focused reviewer verifying logical soundness, edge case handling, race conditions, type safety, and plan compliance.
- **Path**: `skills/correctness-reviewer/SKILL.md`
- **Keywords**: `correctness`, `logic`, `edge cases`, `race conditions`, `type safety`

### adversarial-reviewer
- **Description**: Adversarial code reviewer probing boundary edges, resource exhaustion, denial-of-service, contract violations, and malicious inputs.
- **Path**: `skills/adversarial-reviewer/SKILL.md`
- **Keywords**: `adversarial`, `fuzzing`, `boundary testing`, `dos`, `threat modeling`

### coding-agent
- **Description**: Protocol for autonomous coding agents executing TDD red-green-refactor cycles.
- **Path**: `skills/coding-agent/SKILL.md`
- **Keywords**: `coding agent`, `tdd`, `implementation`, `refactoring`

### superconductor-agents
- **Description**: Protocol for Superconductor agents to operate within the Superconductor spec-driven framework.
- **Path**: `skills/superconductor-agents/SKILL.md`
- **Keywords**: `superconductor`, `swarm`, `multi-agent`, `agent protocol`

### code-review-skill
- **Description**: Comprehensive language-specific code review reference guidelines, heuristics, and anti-patterns.
- **Path**: `skills/code-review-skill/SKILL.md`
- **Keywords**: `code review heuristics`, `language standards`, `review guidelines`

---

## 3. Design OS Suite
Skills powering automated, structured UI/UX planning, component extraction, and kernel registry management.

### design-os-orchestrator
- **Description**: Central status check and step sequencer that guides the user through the structured planning flow.
- **Path**: `skills/design-os-orchestrator/SKILL.md`
- **Keywords**: `What's next`, `status check`, `Design OS`, `orchestrator`

### design-os-vision
- **Description**: Collaboratively define the product overview, goals, features, and target audience.
- **Path**: `skills/design-os-vision/SKILL.md`
- **Keywords**: `new project`, `product vision`, `what are we building`, `product overview`

### design-os-inspiration
- **Description**: Analyze UI reference files to extract palette tokens, psychological rationale, and design layout paradigms.
- **Path**: `skills/design-os-inspiration/SKILL.md`
- **Keywords**: `inspiration`, `moodboard`, `visual reference`, `design study`

### design-os-roadmap
- **Description**: Group features into logical, self-contained development sections.
- **Path**: `skills/design-os-roadmap/SKILL.md`
- **Keywords**: `roadmap`, `milestones`, `development sections`

### design-os-data-model
- **Description**: Define database schema, entities, and field relationships.
- **Path**: `skills/design-os-data-model/SKILL.md`
- **Keywords**: `data model`, `entities`, `relationships`, `schema`

### design-os-design-system
- **Description**: Propose and configure the visual language (typography, colors, semantic tokens) using `superconductor-kernel` MCP tools.
- **Path**: `skills/design-os-design-system/SKILL.md`
- **Keywords**: `colors`, `typography`, `tokens`, `design system`, `set_theme`

### design-os-app-shell
- **Description**: Persistent sidebar, navigation layout, and global responsive chrome layout.
- **Path**: `skills/design-os-app-shell/SKILL.md`
- **Keywords**: `navigation`, `sidebar`, `app layout`, `chrome`, `registry_list_blocks`

### design-os-i18n
- **Description**: Internationalization, locale detection, and currency strategy spec generation.
- **Path**: `skills/design-os-i18n/SKILL.md`
- **Keywords**: `i18n`, `internationalization`, `localization`, `multiple languages`, `currency`

### design-os-enhance
- **Description**: Refactor existing components to match styling guidelines and local themes using MCP tools (`registry_recommend`, `registry_validate_file`, `registry_fix_dogma`).
- **Path**: `skills/design-os-enhance/SKILL.md`
- **Keywords**: `refactor UI`, `upgrade design`, `brownfield`, `registry_fix_dogma`

### design-os-extractor
- **Description**: Extract visual sections or logic blocks to save as local registry Opinion Blocks.
- **Path**: `skills/design-os-extractor/SKILL.md`
- **Keywords**: `extract component`, `Opinion Block`, `reusable component`

### design-os-spec-ingest
- **Description**: Parse external specification documentation to extract requirements and milestones.
- **Path**: `skills/design-os-spec-ingest/SKILL.md`
- **Keywords**: `import spec`, `external document`, `PDF spec`

### design-heuristics
- **Description**: Codified mathematical and aesthetic visual rules for UI/UX generation. Activate whenever a track involves building frontend views, dashboards, layout components, pages, interfaces, or web designs.
- **Path**: `skills/design-heuristics/SKILL.md`
- **Keywords**: `UI`, `dashboard`, `component`, `frontend`, `page`, `interface`, `layout`, `design`

### superconductor-kernel-setup
- **Description**: Setup, build, and verify the Design OS Kernel MCP server.
- **Path**: `skills/superconductor-kernel-setup/SKILL.md`
- **Keywords**: `MCP server`, `kernel setup`, `kernel connection`

### superconductor-kernel-dogma
- **Description**: Guidelines for crafting components and logic that meet Design OS Kernel dogma standards.
- **Path**: `skills/superconductor-kernel-dogma/SKILL.md`
- **Keywords**: `dogma`, `standards`, `registry_validate_file`, `registry_fix_dogma`

### theme-manager-flow
- **Description**: Dark mode implementation, theme creation, and color manager overrides using `set_theme`.
- **Path**: `skills/theme-manager-flow/SKILL.md`
- **Keywords**: `dark mode`, `theme`, `brand colors`, `color override`, `set_theme`

### component-adapter
- **Description**: Promotes third-party raw files to the local registry through automated theme adaptation and dogma checks.
- **Path**: `skills/component-adapter/SKILL.md`
- **Keywords**: `import component`, `third-party registry`, `adapt component`

---

## 4. Support, Exploration & Utility Skills
Interviews, architectural refactoring, ticket generation, and worktree isolation utilities.

### grill
- **Description**: A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go.
- **Path**: `skills/grill/SKILL.md`
- **Keywords**: `grill`, `grilling`, `interview`, `glossary`, `ADR`

### improve-architecture
- **Description**: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
- **Path**: `skills/improve-architecture/SKILL.md`
- **Keywords**: `improve architecture`, `refactoring`, `decoupling`, `codebase architecture`

### to-spec
- **Description**: Convert conversational requirements and rough ideas into a formal `spec.md` document.
- **Path**: `skills/to-spec/SKILL.md`
- **Keywords**: `to-spec`, `formal spec`, `requirements`, `spec.md`

### to-tickets
- **Description**: Break a plan, spec, or conversation into tracer-bullet tickets with blocking edges.
- **Path**: `skills/to-tickets/SKILL.md`
- **Keywords**: `tickets`, `tracer-bullet`, `spec to tickets`, `breakdown`

### worktrunk
- **Description**: Manage Git worktrees for parallel agent workflows or complex multi-branch tasks using the `wt` CLI.
- **Path**: `skills/worktrunk/SKILL.md`
- **Keywords**: `worktrunk`, `worktree`, `git worktree`, `isolated workspace`

---

## 5. Ecosystem & Cloud Extensions

### firebase-ai-logic-basics
- **Description**: Official skill for integrating Firebase AI Logic (Gemini API) into web applications. Covers setup, multimodal inference, structured output, and security.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-ai-logic-basics/`
- **Keywords**: `Firebase`, `AI Logic`, `Gemini API`, `GenAI`

### firebase-app-hosting-basics
- **Description**: Deploy and manage web apps with Firebase App Hosting. Use this skill when deploying Next.js/Angular apps with backends.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-app-hosting-basics/`
- **Keywords**: `Firebase App Hosting`, `Next.js`, `Angular`

### firebase-auth-basics
- **Description**: Guide for setting up and using Firebase Authentication. Use this skill when the user's app requires user sign-in, user management, or secure data access using auth rules.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-auth-basics/`
- **Keywords**: `Firebase Authentication`, `Auth`, `Sign-in`

### firebase-basics
- **Description**: Guide for setting up and using Firebase local environment, first-time setup, and app integration.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-basics/`
- **Keywords**: `Firebase`, `Setup`

### firebase-data-connect-basics
- **Description**: Build and deploy Firebase Data Connect backends with PostgreSQL, GraphQL queries/mutations, and SDK generation.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-data-connect-basics/`
- **Keywords**: `Firebase Data Connect`, `PostgreSQL`, `GraphQL`

### firebase-firestore-basics
- **Description**: Comprehensive guide for Firestore basics including provisioning, security rules, and SDK usage.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-firestore-basics/`
- **Keywords**: `Firestore`, `Database`, `Security Rules`

### firebase-hosting-basics
- **Description**: Skill for working with Firebase Hosting (Classic) for static web apps, SPAs, or simple microservices.
- **URL**: `https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-hosting-basics/`
- **Keywords**: `Firebase Hosting`, `Static Hosting`

### cloud-deploy-pipelines
- **Description**: Manage the entire lifecycle of Google Cloud Deploy delivery pipelines.
- **URL**: `https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/cloud-deploy-pipelines/`
- **Keywords**: `Cloud Deploy`, `delivery pipeline`, `skaffold.yaml`, `clouddeploy.yaml`

### gcp-cicd-deploy
- **Description**: Assistant for deploying applications to Google Cloud (GCS, Cloud Run, GKE).
- **URL**: `https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-deploy/`
- **Keywords**: `Cloud Run`, `GCS`, `Static Site`, `Deployment`, `Google Cloud`

### gcp-cicd-design
- **Description**: Assistant for designing, building, and managing CI/CD pipelines on Google Cloud.
- **URL**: `https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-design/`
- **Keywords**: `CI/CD`, `Pipeline Design`, `Google Cloud`, `Architectural Design`

### gcp-cicd-terraform
- **Description**: Use Terraform to provision Google Cloud resources (GKE, Cloud Run, Cloud SQL) with standard GCS backend state management.
- **URL**: `https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-terraform/`
- **Keywords**: `Terraform`, `GCP`, `GCS Backend`, `Infrastructure as Code`, `IaC`
