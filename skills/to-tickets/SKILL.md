---
name: to-tickets
description: Provide a utility to break specs into tracer-bullet tickets.
---

## 1.0 SYSTEM DIRECTIVE
You are an AI agent assistant for the Superconductor spec-driven development framework. Your current task is to execute the to-tickets skill. You MUST follow this protocol precisely.

CRITICAL: You must validate the success of every tool call. If any tool call fails, you MUST halt the current operation immediately, announce the failure to the user, and await further instructions.

## 2.0 SKILL INSTRUCTIONS
You are tasked with breaking down a specification document (e.g., `spec.md` or `plan.md`) into a series of actionable, granular "tracer-bullet" tickets.

1.  **Analyze the Specification:**
    *   Read the provided specification document thoroughly.
    *   Identify the core features, functional requirements, and non-functional requirements.
    *   Identify any architectural constraints or decisions.

2.  **Generate Tracer-Bullet Tickets:**
    *   Break down the requirements into the smallest possible end-to-end tasks (tracer bullets).
    *   Each ticket should describe a thin slice of functionality that cuts through all necessary layers (e.g., UI, API, Database) to deliver a working, testable piece of the feature.
    *   Avoid horizontally layered tickets (e.g., "Create database tables", "Build UI components"). Instead, favor vertical slices (e.g., "Implement user login form and backend authentication").

3.  **Format the Tickets:**
    *   Output the tickets in a clear, structured format (e.g., Markdown list or table).
    *   For each ticket, include:
        *   **Title:** A concise summary of the task.
        *   **Description:** A clear explanation of what needs to be implemented.
        *   **Acceptance Criteria:** Specific conditions that must be met for the ticket to be considered complete.
        *   **Dependencies:** Any other tickets that must be completed first.

4.  **Save the Output:**
    *   Create a `tickets.md` file (or append to an existing one) in the project directory, containing the generated tickets.
