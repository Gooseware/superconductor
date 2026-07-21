# Agent Skills Catalog

This catalog defines the curriculum of skills available to the Superconductor extension.

## Firebase Skills
Skills focused on setting up, managing, and using various Firebase services.

### firebase-ai-logic-basics
- **Description**: Official skill for integrating Firebase AI Logic (Gemini API) into web applications. Covers setup, multimodal inference, structured output, and security.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-ai-logic-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase`, `AI Logic`, `Gemini API`, `GenAI`

### firebase-app-hosting-basics
- **Description**: Deploy and manage web apps with Firebase App Hosting. Use this skill when deploying Next.js/Angular apps with backends.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-app-hosting-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase App Hosting`, `Next.js`, `Angular`

### firebase-auth-basics
- **Description**: Guide for setting up and using Firebase Authentication. Use this skill when the user's app requires user sign-in, user management, or secure data access using auth rules.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-auth-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase Authentication`, `Auth`, `Sign-in`

### firebase-basics
- **Description**: Guide for setting up and using Firebase. Use this skill when the user is getting started with Firebase - setting up local environment, using Firebase for the first time, or adding Firebase to their app.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase`, `Setup`

### firebase-data-connect-basics
- **Description**: Build and deploy Firebase Data Connect backends with PostgreSQL. Use for schema design, GraphQL queries/mutations, authorization, and SDK generation for web, Android, iOS, and Flutter apps.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-data-connect-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase Data Connect`, `PostgreSQL`, `GraphQL`

### firebase-firestore-basics
- **Description**: Comprehensive guide for Firestore basics including provisioning, security rules, and SDK usage. Use this skill when the user needs help setting up Firestore, writing security rules, or using the Firestore SDK in their application.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-firestore-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firestore`, `Database`, `Security Rules`

### firebase-hosting-basics
- **Description**: Skill for working with Firebase Hosting (Classic). Use this when you want to deploy static web apps, Single Page Apps (SPAs), or simple microservices. Do NOT use for Firebase App Hosting.
- **URL**: https://raw.githubusercontent.com/firebase/agent-skills/main/skills/firebase-hosting-basics/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `firebase`, `firebase-admin`
    - **Keywords**: `Firebase Hosting`, `Static Hosting`

## DevOps Skills
Skills for designing, building, and managing CI/CD pipelines and infrastructure on Google Cloud.

### cloud-deploy-pipelines
- **Description**: Manage the entire lifecycle of Google Cloud Deploy, from designing and creating delivery pipelines to managing releases and debugging failures.
- **URL**: https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/cloud-deploy-pipelines/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `skaffold`
    - **Keywords**: `Cloud Deploy`, `delivery pipeline`, `skaffold.yaml`, `clouddeploy.yaml`

### gcp-cicd-deploy
- **Description**: Assistant for deploying applications to Google Cloud, supporting Static Sites (GCS), Cloud Run (Buildpacks or Images), and GKE.
- **URL**: https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-deploy/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `gcloud`
    - **Keywords**: `Cloud Run`, `GCS`, `Static Site`, `Deployment`, `Google Cloud`

### gcp-cicd-design
- **Description**: Assistant for designing, building, and managing CI/CD pipelines on Google Cloud, focusing on architectural design and implementation planning.
- **URL**: https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-design/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `CI/CD`, `Pipeline Design`, `Google Cloud`, `Architectural Design`

### gcp-cicd-terraform
- **Description**: Use Terraform to provision Google Cloud resources (GKE, Cloud Run, Cloud SQL) with standard GCS backend state management and IAM least-privilege.
- **URL**: https://raw.githubusercontent.com/gemini-cli-extensions/devops/main/skills/gcp-cicd-terraform/
- **Party**: 1p
- **Detection Signals**:
    - **Dependencies**: `terraform`
    - **Keywords**: `Terraform`, `GCP`, `GCS Backend`, `Infrastructure as Code`, `IaC`

## Design Skills
Skills focused on UI/UX aesthetics, layout, colors, accessibility, and visual guidelines.

### design-heuristics
- **Description**: Codified mathematical and aesthetic visual rules for UI/UX generation. Activate this skill whenever a track involves building frontend views, dashboards, layout components, pages, interfaces, or web designs.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-heuristics/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `UI`, `dashboard`, `component`, `frontend`, `page`, `interface`, `layout`, `design`

## Design OS Skills
Agent skills that power the automated, structured planning and component generation workflow of Design OS.

### design-os-orchestrator
- **Description**: Central status check and step sequencer that guides the user through the structured planning flow.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-orchestrator/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `What's next`, `status check`, `Design OS`, `orchestrator`

### design-os-vision
- **Description**: Collaboratively define the product overview, goals, features, and target audience.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-vision/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `new project`, `product vision`, `what are we building`, `product overview`

### design-os-roadmap
- **Description**: Group features into logical, self-contained development sections.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-roadmap/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `roadmap`, `milestones`, `development sections`

### design-os-data-model
- **Description**: Define database schema, entities, and field relationships.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-data-model/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `data model`, `entities`, `relationships`, `schema`

### design-os-design-system
- **Description**: Propose and configure the visual language (typography, colors, semantic tokens).
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-design-system/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `colors`, `typography`, `tokens`, `design system`

### design-os-kernel-setup
- **Description**: Setup, build, and verify the Design OS Kernel MCP server.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-kernel-setup/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `MCP server`, `kernel setup`, `kernel not connected`

### theme-manager-flow
- **Description**: Dark mode implementation, theme creation, and color manager overrides.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/theme-manager-flow/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `dark mode`, `theme`, `brand colors`, `color override`

### design-os-inspiration
- **Description**: Analyze UI reference files to extract palette tokens and design layout paradigms.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-inspiration/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `inspiration`, `moodboard`, `visual reference`

### design-os-enhance
- **Description**: Refactor existing components to match styling guidelines and local themes.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-enhance/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `refactor UI`, `upgrade design`, `brownfield`

### design-os-i18n
- **Description**: Internationalization, locale detection, and currency strategy spec generation.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-i18n/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `i18n`, `internationalization`, `localization`, `multiple languages`, `currency`

### design-os-app-shell
- **Description**: persistent sidebar, navigation layout, and global responsive chrome layout.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-app-shell/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `navigation`, `sidebar`, `app layout`, `chrome`

### design-os-spec-ingest
- **Description**: Parse external specification documentation to extract requirements and milestones.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-spec-ingest/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `import spec`, `external document`, `PDF spec`

### component-adapter
- **Description**: Promotes third-party raw files to the local registry through automated theme adaptation and dogma checks.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/component-adapter/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `import component`, `third-party registry`, `adapt component`

### design-os-extractor
- **Description**: Extract visual sections or logic blocks to save as local registry Opinion Blocks.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/design-os-extractor/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `extract component`, `Opinion Block`, `reusable component`

## Caduceus Integration Skills
Skills focused on orchestrating autonomous agent swarms and integrating with Caduceus.

### swarm-orchestrate
- **Description**: Multi-agent swarm orchestration with automated code > review > code > review > oracle loop for Superconductor tracks.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/swarm-orchestrate/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `swarm`, `orchestration`, `multi-agent`, `review loop`, `parallel workers`

### caduceus-superconductor
- **Description**: Protocol for Caduceus agents to operate within the Superconductor spec-driven framework.
- **URL**: https://raw.githubusercontent.com/superconductor/skills/main/skills/caduceus-superconductor/
- **Party**: 1p
- **Detection Signals**:
    - **Keywords**: `caduceus`, `swarm`, `multi-agent`, `code generation`, `parallel agents`

