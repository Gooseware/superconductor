# Setup Protocol References & Advanced Scaffolding Protocols

## 2.6 ADVANCED SKILL SELECTION & DESIGN OS MCP CONFIGURATION
1. **Analyze and Recommend**: Read `skills/catalog.md` from `~/.gemini/extensions/superconductor/skills/catalog.md`. Detect applicable skills based on `detectSignals` matched against project files.
2. **Determine Mode**: Prompt user with recommended skills or hand-pick option.
3. **Installation Action**: Download 1p / 3p skills to `.agents/skills/<skill-name>/` or `~/.agents/extensions/superconductor/skills/<skill-name>/`.
4. **Skill Reload Confirmation**: Instruct user to run `/skills reload`.
5. **Configure Design OS MCP Server**: Configure `mcp_config.json` to point `design-os-kernel` to component repository URL.

---

## 3.0 INITIAL PLAN AND TRACK GENERATION
**PROTOCOL: Interactively define project requirements, propose a single track, and then automatically create the corresponding track and its phased plan.**

**Pre-Requisite (Cleanup):** If you are resuming this section because a previous setup was interrupted, check if the `superconductor/tracks/` directory exists but is incomplete. If it exists, **delete** the entire `superconductor/tracks/` directory before proceeding to ensure a clean slate for the new track generation.

### 3.1 Generate Product Requirements (Interactive)(For greenfield projects only)
1.  **Transition to Requirements:** Announce that the initial project setup is complete. State that you will now begin defining the high-level product requirements by asking about topics like user stories and functional/non-functional requirements.
2.  **Analyze Context:** Read and analyze the content of `superconductor/product.md` to understand the project's core concept.
3.  **Determine Mode:** Use the `ask_user` tool to let the user choose their preferred workflow.
    - **questions:**
        - **header:** "Product Reqs"
        - **question:** "How would you like to define the product requirements? I can guide you through user stories and features, or I can draft them based on our initial concept."
        - **type:** "choice"
        - **options:**
            - Label: "Interactive", Description: "I'll guide you through questions about user stories and functional goals."
            - Label: "Autogenerate", Description: "I'll draft the requirements based on the Product Guide."

5.  **Gather Information (Conditional):**
    -   **If user chose "Autogenerate":** Skip this step and proceed directly to **Step 6 (Drafting Logic)**.
    -   **If user chose "Interactive":** Use a single `ask_user` tool call to gather detailed requirements.
        -   **CRITICAL:** Batch up to 4 questions in this single tool call (e.g., User Stories, Key Features, Constraints, Non-functional Requirements).
        -   **SUGGESTIONS:** For each question, generate 3 high-quality suggested answers based on the project goal.
        -   **Formulation Guidelines:** Use "choice" type. Set `multiSelect` to `true` for additive answers. Construct the `questions` array where each object has a `header` (max 16 chars), `question`, and `options` (each with `label` and `description`).
        -   **Note:** Do NOT include an "Autogenerate" option here.
        -   **Interaction Flow:** Wait for the user's response, then proceed to the next step.

6.  **Drafting Logic:** Once information is gathered (or Autogenerate selected), generate a draft of the product requirements.
    -   **CRITICAL:** When processing user responses or auto-generating content, the source of truth for generation is **only the user's selected answer(s)**.
7.  **User Confirmation Loop:**
    -   **Announce:** Briefly state that the requirements draft is ready. Do NOT repeat the request to "review" or "approve" in the chat.
    -   **Ask for Approval:** Use the `ask_user` tool to request confirmation. You MUST embed the drafted requirements directly into the `question` field so the user can review them.
        - **questions:**
            - **header:** "Review"
            - **question:**
                Please review the drafted Product Requirements below. What would you like to do next?

                ---

                <Insert Drafted Requirements Here>
            - **type:** "choice"
            - **multiSelect:** false
            - **options:**
                - Label: "Approve", Description: "The requirements look good, proceed to the next step."
                - Label: "Suggest changes", Description: "I want to modify the drafted content."
8.  **Continue:** Once approved, retain these requirements in your context and immediately proceed to propose a track in the next section.

### 3.2 Propose a Single Initial Track (Automated + Approval)
1.  **State Your Goal:** Announce that you will now propose an initial track to get the project started. Briefly explain that a "track" is a high-level unit of work (like a feature or bug fix) used to organize the project.
2.  **Generate Track Title:** Analyze the project context (`product.md`, `tech-stack.md`) and (for greenfield projects) the requirements gathered in the previous step. Generate a single track title that summarizes the entire initial track.
    - **Greenfield:** Focus on the MVP core (e.g., "Build core tip calculator functionality").
    - **Brownfield:** Focus on maintenance or targeted enhancements (e.g., "Implement user authentication flow").
3.  **Confirm Proposal:** Use the `ask_user` tool to validate the proposal:
    - **questions:**
        - **header:** "Confirm Track"
        - **type:** "choice"
        - **multiSelect:** false
        - **question:** "To get the project started, I suggest the following track: '<Track Title>'. Do you want to proceed with this track?"
        - **options:**
            - Label: "Yes", Description: "Proceed with '<Track Title>'."
            - Label: "Suggest changes", Description: "I want to define a different track."
4.  **Action:**
    -   **If user chose "Yes":** Use the suggested '<Track Title>' as the track description.
    -   **If user chose "Suggest changes":**
        -   Immediately call the `ask_user` tool again:
            - **header:** "New Track"
            - **type:** "text"
            - **question:** "Please enter the description for the initial track:"
            - **placeholder:** "e.g., Setup CI/CD pipeline"
        -   Use the user's text response as the track description.
    -   Proceed to **Section 3.3** with the determined track description.

### 3.3 Convert the Initial Track into Artifacts (Automated)
1.  **State Your Goal:** Once the track is approved, announce that you will now create the artifacts for this initial track.
2.  **Initialize Tracks File:** Create the `superconductor/tracks.md` file with the initial header and the first track:
    ```markdown
    # Project Tracks

    This file tracks all major tracks for the project. Each track has its own detailed plan in its respective folder.

    ---

    - [ ] **Track: <Track Description>**
      *Link: [./<Tracks Directory Name>/<track_id>/](./<Tracks Directory Name>/<track_id>/)*
    ```
    (Replace `<Tracks Directory Name>` with the actual name of the tracks folder resolved via the protocol.)
3.  **Generate Track Artifacts:**
    a. **Define Track:** The approved title is the track description.
    b. **Generate Track-Specific Spec & Plan:**
        i. Automatically generate a detailed `spec.md` for this track.
        ii. Automatically generate a `plan.md` for this track.
            - **CRITICAL:** The structure of the tasks must adhere to the principles outlined in the workflow file at `superconductor/workflow.md`. For example, if the workflow specificies Test-Driven Development, each feature task must be broken down into a "Write Tests" sub-task followed by an "Implement Feature" sub-task.
            - **CRITICAL:** Include status markers `[ ]` for **EVERY** task and sub-task. The format must be:
                - Parent Task: `- [ ] Task: ...`
                - Sub-task: `    - [ ] ...`
            - **CRITICAL: Inject Phase Completion Tasks.** You MUST read the `superconductor/workflow.md` file to determine if a "Phase Completion Verification and Checkpointing Protocol" is defined. If this protocol exists, then for each **Phase** that you generate in `plan.md`, you MUST append a final meta-task to that phase. The format for this meta-task is: `- [ ] Task: Superconductor - User Manual Verification '<Phase Name>' (Protocol in workflow.md)`. You MUST replace `<Phase Name>` with the actual name of the phase.
    c. **Create Track Artifacts:**
        i. **Generate and Store Track ID:** Create a unique Track ID from the track description using format `shortname_YYYYMMDD` and store it. You MUST use this exact same ID for all subsequent steps for this track.
        ii. **Create Single Directory:** Resolve the **Tracks Directory** via the **Universal File Resolution Protocol** and create a new directory: `<Tracks Directory>/<track_id>/`.
        iii. **Create `metadata.json`:** In the new directory, create a `metadata.json` file with the correct structure and content, using the stored Track ID. An example is:
            - ```json
            {
            "track_id": "<track_id>",
            "type": "feature", // or "bug"
            "status": "new", // or in_progress, completed, cancelled
            "created_at": "YYYY-MM-DDTHH:MM:SSZ",
            "updated_at": "YYYY-MM-DDTHH:MM:SSZ",
            "description": "<Initial user description>"
            }
            ```
        Populate fields with actual values. Use the current timestamp.
        iv. **Write Spec and Plan Files:** In the exact same directory, write the generated `spec.md` and `plan.md` files.
        v.  **Write Index File:** In the exact same directory, write `index.md` with content:
            ```markdown
            # Track <track_id> Context

            - [Specification](./spec.md)
            - [Implementation Plan](./plan.md)
            - [Metadata](./metadata.json)
            ```
            *(If you arrived here directly from the Audit because you are patching a missing index, write this file using the existing folder's track_id and then proceed to step d.)*

    d. **Exit Plan Mode:** Call the `exit_plan_mode` tool with the path: `<Tracks Directory>/<track_id>/index.md`.

    e. **Announce Progress:** Announce that the track for "<Track Description>" has been created.

### 3.4 Final Announcement
1.  **Announce Completion:** After the track has been created, announce that the project setup and initial track generation are complete.
2.  **Save Superconductor Files:** Add and commit all files with the commit message `superconductor(setup): Add superconductor setup files`.
3.  **Next Steps:** Inform the user that they can now begin work by running `/superconductor:implement`.
