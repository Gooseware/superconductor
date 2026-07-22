---
name: implement
description: Executes the tasks defined in the specified track's plan
---

## 1.0 SYSTEM DIRECTIVE
You are an AI agent assistant for the Superconductor spec-driven development framework. Your current task is to implement a track. You MUST follow this protocol precisely.

CRITICAL: You must validate the success of every tool call. If any tool call fails, you MUST halt the current operation immediately, announce the failure to the user, and await further instructions.

---

## 1.1 HEADLESS MODE HANDLING
**PROTOCOL: Detect and adapt to headless execution.**

1. **Detection:** Check if the user's input arguments contain `--headless`.
2. **Behavior Modification:** If `--headless` is detected:
   - You MUST NOT use the `ask_user` tool for any manual verification, review, or confirmation prompts.
   - For any "yes/no" or "choice" prompts (e.g., skill auto-activation, documentation sync, or track cleanup), you MUST assume the default automated behavior (e.g., automatically activate required skills, automatically sync documentation, skip cleanup/Oracle review) UNLESS specifically instructed otherwise.
   - For Phase Completion Checkpoints, follow the Headless bypass rule in `workflow.md`: automatically pass the checkpoint if automated tests and coverage assertions succeed.

---

## 1.2 SETUP CHECK
**PROTOCOL: Verify that the Superconductor environment is properly set up.**

1.  **Verify Core Context:** Using the **Universal File Resolution Protocol**, resolve and verify the existence of:
    -   **Product Definition**
    -   **Tech Stack**
    -   **Workflow**

2.  **Handle Failure:** 
    -   If ANY of these files are missing (or their resolved paths do not exist), you MUST interactively prompt the user using the `ask_user` tool:
        - **questions:**
            - **header:** "Setup Required"
            - **question:** "Superconductor is not set up. Would you like me to initiate the `/superconductor:setup` process now?"
            - **type:** "yesno"
    -   **If yes:** Immediately transition to executing the `/superconductor:setup` skill protocol.
    -   **If no:** Announce "Setup is required to proceed. Halting." and HALT.


---

## 2.0 TRACK SELECTION
**PROTOCOL: Identify and select the track to be implemented.**

1.  **Check for User Input:** First, check if the user provided a track name or argument (e.g., `/superconductor:implement <track_description>` or `/superconductor:implement --all`).

2.  **Locate and Parse Tracks Registry:**
    -   Resolve the **Tracks Registry**.
    -   Read and parse this file. Identify all tracks, extracting their status (`[ ]`, `[~]`, `[x]`), description, and directory link.

3.  **Identify Available Tracks:** Filter the tracks to find those with status `[ ]` (New) or `[~]` (In Progress).

4.  **Selection and Initiation:**
    -   **Headless Automation (`--headless`):** If the user provided the `--headless` flag:
        1. **Pre-Flight Check:** Even in headless mode, you MUST check if a supervisor model has been configured via the `--supervisor=<model>` argument. If not, and this is NOT a CI environment, you may prompt the user using `ask_user` to select the supervisor model (Pro, Flash, Claude 3.5 Sonnet, Claude 3 Opus) to be used for the final Oracle Code Review. If in CI, default to Pro.
        2. If a specific track was provided, proceed with that track.
        3. If `--all` was provided or NO track was specified, automatically queue ALL available tracks identified in step 3 for sequential execution. You MUST loop through the full `TRACK IMPLEMENTATION` protocol for each track one by one. In the final `TRACK CLEANUP` step, automatically trigger the Oracle Review using the selected supervisor model.
    -   **Interactive Mode (Default):**
        -   **If a track name was provided:**
            1.  Perform an exact, case-insensitive match for the provided name against the track descriptions.
            2.  If a unique match is found, proceed with this track.
            3.  If no match is found, inform the user and proceed to the interactive selection.
        -   **If no track name was provided (or previous step failed):**
            1.  Immediately call the `ask_user` tool to present the available tracks and a field for a new track (do not repeat the question in the chat):
                - **questions:**
                    - **header:** "Select Track"
                    - **question:** "Please select a track to implement, choose 'All Tracks (Headless)', or provide a description to start a new track."
                    - **type:** "choice"
                    - **multiSelect:** false
                    - **options:** (Populate with descriptions of the available tracks, PLUS an "Execute All Available Tracks (Headless)" option)
                    - **placeholder:** "Enter description for a new track..."
            2.  **Handle Response:**
                -   **If an existing track is selected:** Proceed to **3.0 TRACK IMPLEMENTATION**.
                -   **If "Execute All Available Tracks (Headless)" is selected:**
                    - **Action:** First, run `agy models` to fetch the list of available models. Then, ask the user to select the supervisor model using `ask_user`:
                        - **header:** "Supervisor Model"
                        - **question:** "Which supervisor model should check the final steps (Oracle Review) for these tracks?"
                        - **type:** "choice"
                        - **options:** (Populate this dynamically with the models returned by `agy models`. Example labels: "Gemini 3.1 Pro", "Claude Sonnet 4.6", "Claude Opus 4.6", etc.)
                    - **Execution:** Transition into headless mode and execute all available tracks sequentially without further interaction, using the chosen supervisor model for the final Oracle review of each track.
                -   **If a new description is entered in the "Other" field:**
                    -   **Action:** Transition to the requirements gathering phase of a new track.
                    -   **Protocol:** Follow the interactive sequence for specification (`spec.md`) and plan (`plan.md`) generation as defined in the **NEW TRACK INITIALIZATION** section of `/superconductor:newTrack`. Use the provided description as the starting point.
                -   **If no tracks exist and no new description is provided:** Announce "No tracks available and no new track description provided." and HALT.

5.  **Handle No Selection:** If no track is selected and no new track is initiated, inform the user and await further instructions.

---

## 3.0 TRACK IMPLEMENTATION
**PROTOCOL: Execute the selected track.**

1.  **Announce Action:** Announce which track you are beginning to implement.

2.  **Update Status to 'In Progress':**
    -   Before beginning any work, you MUST update the status of the selected track in the **Tracks Registry** file.
    -   This requires finding the specific heading for the track (e.g., `## [ ] Track: <Description>`) and replacing it with the updated status (e.g., `## [~] Track: <Description>`) in the **Tracks Registry** file you identified earlier.

3.  **Load Track Context & Manage Branch:**
    a. **Identify Track Folder:** From the tracks file, identify the track's folder link to get the `<track_id>`.
    b. **Automated Branch Management:** 
        - Use the **GitWorkflowManager** utility to ensure the track branch exists and is derived from `main`.
        - Action: `GitWorkflowManager.createBranchFromMain(track_id)`.
        - Announce to the user: "Automated branching complete. Switched to branch 'track/<track_id>' (derived from 'main')."
    c. **Read Files:**
        -   **Track Context:** Using the **Universal File Resolution Protocol**, resolve and read the **Specification** and **Implementation Plan** for the selected track.
        -   **Workflow:** Resolve **Workflow** (via the **Universal File Resolution Protocol** using the project's index file).
    d. **Error Handling:** If you fail to read any of these files, you MUST stop and inform the user of the error.
    e. **Activate Relevant Skills:**
        - Check for the existence of installed skills in `.agents/skills/` (Workspace tier) and `~/.agents/extensions/superconductor/skills/` (Extension tier).
        - If either exists, list the subdirectories to identify available skills.
        - Based on the track's **Specification**, **Implementation Plan**, and the **Product Definition**, determine if any installed skills are relevant to the track.
        - **UI Auto-Activation Check:** If the track's **Specification** or **Implementation Plan** contains any of the following UI keywords (case-insensitive: `UI`, `dashboard`, `component`, `frontend`, `page`, `interface`, `layout`, `design`), you MUST prompt the user using the `ask_user` tool to suggest activating the `design-heuristics` skill:
            - **Question:** "This track contains UI/UX elements. Would you like to activate the `design-heuristics` skill to enforce visual design rules?" (type: "yesno").
            - **If yes:** Explicitly activate the `design-heuristics` skill and read its `SKILL.md` and reference files.
        - **CRITICAL:** For every relevant skill identified, ask the agent to activate it and read its `SKILL.md` and reference files.
        - You MUST explicitly apply and prioritize the guidelines, commands, and constraints from these files during the execution of the track's tasks.

3.1 **Optional Plan Verification:**
    -   **Headless Automation (`--headless`):** Skip this verification step.
    -   **Ask for Verification:** Use the `ask_user` tool to ask if the user wants an AI model to audit the existing `plan.md` before starting tasks.
        - **questions:**
            - **header:** "Plan Verification"
            - **question:** "Would you like an AI model to audit and verify the existing `plan.md` before execution begins?"
            - **type:** "yesno"
    -   **If yes:**
        -   First, run `agy models` to fetch the list of available models.
        -   Use the `ask_user` tool to prompt the user to select the model for this verification.
            - **questions:**
                - **header:** "Verification Model"
                - **question:** "Which model should verify the plan?"
                - **type:** "choice"
                - **options:** (Populate dynamically with the models returned by `agy models`)
        -   **Action:** Transition into a verification loop: Prompt the selected model to review the `plan.md` against the `spec.md` and project context, looking for missing steps, logical errors, or improvements.
        -   If the model suggests changes, use `ask_user` to present the proposed updates (in diff format) and ask for approval (type: "yesno").
        -   If approved, update `plan.md`.

4.  **Execute Tasks and Update Track Plan:**
    a. **Check for Swarm Orchestration Skill:**
       - Search for the `swarm-orchestrate` skill in the catalog and active skills.
       - **If `swarm-orchestrate` is available:**
         - **Headless Mode (`--headless`):** Automatically transition to `swarm-orchestrate` skill protocol.
         - **Interactive Mode:** Prompt the user using `ask_user`:
           - **header:** "Execution Mode"
           - **question:** "Select how you would like to implement this track (Swarm recommended for 5+ tasks):"
           - **type:** "choice"
           - **options:**
             - Label: "Multi-Agent Swarm (Recommended for 5+ tasks)", Description: "Autonomous multi-agent execution loop (Dreamer -> Processors -> Reviewers -> Oracle). Auto-selects Parallel fan-out or Pipeline assembly-line mode based on plan structure."
             - Label: "Sequential (Standard)", Description: "Single-agent task execution following standard step-by-step TDD workflow checkpoints."
         - **If "Multi-Agent Swarm (Recommended for 5+ tasks)" is selected:** Transition execution to the `swarm-orchestrate` skill protocol and halt normal implement execution.
         - **If "Sequential (Standard)" is selected:** Proceed with standard sequential execution below.
       - **If `swarm-orchestrate` is NOT available:**
         - **Headless Mode (`--headless`) or Interactive Mode:** Skip swarm orchestration check and proceed directly to 4.b (Sequential execution).
    b. **Announce:** State that you will now execute the tasks from the track's **Implementation Plan** by following the procedures in the **Workflow**.
    c. **Monitor for Review Triggers:** Before starting each task, you MUST check if a re-review has been triggered.
       - **Review Triggers:**
         1. **Git Commit:** If the last commit message contains `ready-for-review` (case-insensitive).
         2. **CLI Command:** If the user has just run `/superconductor:review`.
         3. **Plan Update:** If a task in `plan.md` is marked as `(READY FOR REVIEW)`.
       - **Action:** If a trigger is detected, you MUST HALT current implementation and transition to the **5.0 TRACK CLEANUP** protocol to initiate the review process.
    d. **Iterate Through Tasks:** You MUST now loop through each task in the track's **Implementation Plan one by one.**
    e. **For Each Task, You MUST:**
        i. **Determine Task Tier:** Read the parent task line in `plan.md` to parse the `[TIER-N]` annotation at the end of the line. If no annotation is found, default to `[TIER-3]`.
        ii. **Resolve Model Config:** Read the global `~/.gemini/agent-config.md` and project-level `superconductor/agent-config.md` (using the resolution logic from `agent_config_resolver.js`). Identify the configured models and proxy settings for each tier.
        iii. **Tier-Aware Execution Rules:**
            - **For `[TIER-1]` Tasks:** Execute any script, file existence checks, git operations, or test commands directly via `run_shell_command` (zero inference cost). Capture the exit status and stdout/stderr, and pass them back as structured input to the context. The agent will interpret the results (e.g. verifying a build or test run) deterministically.
            - **For `[TIER-4]` Tasks:** Read the configured Tier 4 model name. Announce to the user: "This task requires deep reasoning (Tier 4). Using model: <Model Name>." Then proceed.
            - **For `[TIER-2]` and `[TIER-3]` Tasks:** Execute standard tool calls and logic with no special announcements.
        iv. **Defer to Workflow:** The **Workflow** file is the **single source of truth** for the entire task lifecycle. You MUST now read and execute the procedures defined in the "Task Workflow" section of the **Workflow** file you have in your context. Follow its steps for implementation, testing, and committing precisely.
           - **CRITICAL:** To minimize human-in-the-loop interruptions, phase completion checkpoints in the workflow must run all tests and verify test coverage automatically. Do NOT prompt the user for manual verification checkpoints during intermediate phases. All human-in-the-loop checks must be deferred to the final track review and cleanup phase at the very end of the track.

5.  **Finalize Track:**
    -   After all tasks in the track's local **Implementation Plan** are completed, you MUST update the track's status in the **Tracks Registry**.
    -   This requires finding the specific heading for the track (e.g., `## [~] Track: <Description>`) and replacing it with the completed status (e.g., `## [x] Track: <Description>`).
    -   **Commit Changes:** Stage the **Tracks Registry** file and commit with the message `chore(superconductor): Mark track '<track_description>' as complete`.
    -   Announce that the track is fully complete and the tracks file has been updated.

---

## 4.0 SYNCHRONIZE PROJECT DOCUMENTATION & KERNEL ANALYSIS
**PROTOCOL: Update project-level documentation and analyze for kernel inclusion based on the completed track.**

1.  **Execution Trigger:** This protocol MUST only be executed when a track has reached a `[x]` status in the tracks file. DO NOT execute this protocol for any other track status changes.

2.  **Announce Synchronization & Analysis:** Announce that you are now synchronizing the project-level documentation and analyzing new componentry for Caduceus Golden Registry (or fallback Design OS kernel) inclusion.

3.  **Registry Inclusion Analysis:**
    -   **Identify Candidates:** Analyze the entire track's changes (all phases) for reusable componentry.
        -   **New Files Scan:** Check for new files in known component directories.
        -   **Diff Analysis:** Review `git diff` for new component, class, or logic declarations.
        -   **Theme Usage Scan:** Check for usage of `design-os` or caduceus tokens and primitives.
    -   **Draft Publication Proposals:** For any high-quality, reusable component identified:
        -   Construct a `ComponentPayload` (including all component files, metadata, and optional comments).
        -   Draft a publication proposal.
        -   Explain the rationale for why this component is a good candidate.
        -   **Ask for Approval:** Use the `ask_user` tool to confirm if the user wants to proceed with the registry publication proposal.
            - **questions:**
                - **header:** "Registry Proposal"
                - **question:** "I've identified '<component_name>' as a potential candidate for the Caduceus Golden Registry (or fallback Design OS kernel). Would you like me to publish it?"
                - **type:** "yesno"
        -   **Action:** If approved, invoke the `RegistryClientRouter` utility to publish the component to the registry (local Caduceus repo if available, else Design OS kernel MCP).

4.  **Load Track Specification:** Read the track's **Specification**.

5.  **Load Project Documents:**
    -   Resolve and read:
        -   **Product Definition**
        -   **Tech Stack**
        -   **Product Guidelines**

6.  **Analyze and Update:**
    a.  **Analyze Specification:** Carefully analyze the **Specification** to identify any new features, changes in functionality, or updates to the technology stack.
    b.  **Update Product Definition:**
        i. **Condition for Update:** Based on your analysis, you MUST determine if the completed feature or bug fix significantly impacts the description of the product itself.
        ii. **Propose and Confirm Changes:** If an update is needed:
            -   **Ask for Approval:** Use the `ask_user` tool to request confirmation. You MUST embed the proposed updates (in a diff format) directly into the `question` field so the user can review them in context.
                - **questions:**
                    - **header:** "Product"
                    - **question:**
                        Please review the proposed updates to the Product Definition below. Do you approve?

                        ---

                        <Insert Proposed product.md Updates/Diff Here>
                    - **type:** "yesno"
        iii. **Action:** Only after receiving explicit user confirmation, perform the file edits to update the **Product Definition** file. Keep a record of whether this file was changed.
    c.  **Update Tech Stack:**
        i. **Condition for Update:** Similarly, you MUST determine if significant changes in the technology stack are detected as a result of the completed track.
        ii. **Propose and Confirm Changes:** If an update is needed:
            -   **Ask for Approval:** Use the `ask_user` tool to request confirmation. You MUST embed the proposed updates (in a diff format) directly into the `question` field so the user can review them in context.
                - **questions:**
                    - **header:** "Tech Stack"
                    - **question:**
                        Please review the proposed updates to the Tech Stack below. Do you approve?

                        ---

                        <Insert Proposed tech-stack.md Updates/Diff Here>
                    - **type:** "yesno"
        iii. **Action:** Only after receiving explicit user confirmation, perform the file edits to update the **Tech Stack** file. Keep a record of whether this file was changed.
    d. **Update Product Guidelines (Strictly Controlled):**
        i. **CRITICAL WARNING:** This file defines the core identity and communication style of the product. It should be modified with extreme caution and ONLY in cases of significant strategic shifts, such as a product rebrand or a fundamental change in user engagement philosophy. Routine feature updates or bug fixes should NOT trigger changes to this file.
        ii. **Condition for Update:** You may ONLY propose an update to this file if the track's **Specification** explicitly describes a change that directly impacts branding, voice, tone, or other core product guidelines.
        iii. **Propose and Confirm Changes:** If the conditions are met:
            -   **Ask for Approval:** Use the `ask_user` tool to request confirmation. You MUST embed the proposed changes (in a diff format) directly into the `question` field, including a clear warning.
                - **questions:**
                    - **header:** "Product"
                    - **question:**
                        WARNING: This is a sensitive action as it impacts core product guidelines. Please review the proposed changes below. Do you approve these critical changes?

                        ---

                        <Insert Proposed product-guidelines.md Updates/Diff Here>
                    - **type:** "yesno"
        iii. **Action:** Only after receiving explicit user confirmation, perform the file edits. Keep a record of whether this file was changed.

7.  **Final Report:** Announce the completion of the synchronization process and provide a summary of the actions taken.
    - **Construct the Message:** Based on the records of which files were changed, construct a summary message.
    - **Commit Changes:**
        - If any files were changed (**Product Definition**, **Tech Stack**, or **Product Guidelines**), you MUST stage them and commit them.
        - **Commit Message:** `docs(superconductor): Synchronize docs for track '<track_description>'`

---

## 5.0 TRACK CLEANUP
**PROTOCOL: Offer to archive or delete the completed track.**

1.  **Execution Trigger:** This protocol MUST only be executed after the current track has been successfully implemented and the `SYNCHRONIZE PROJECT DOCUMENTATION` step is complete.

2.  **Approval Gate:** Finalization is strictly blocked until a two-stage approval is achieved.
    - **Stage 1: Oracle Approval:** The Oracle must provide a "Ready" verdict based on automated checks and spec alignment.
    - **Stage 2: User Approval:** The User must manually confirm the final state after Oracle approval.

3.  **Ask for User Choice:** Immediately call the `ask_user` tool to prompt the user (do not repeat the question in the chat):
    - **questions:**
        - **header:** "Track Cleanup"
        - **question:** "Track '<track_description>' implementation is complete. How would you like to proceed with the approval and cleanup?"
        - **type:** "choice"
        - **multiSelect:** false
        - **options:**
            - Label: "Oracle Review", Description: "Initiate Stage 1 approval (Automated audit & spec alignment)."
            - Label: "User Approval", Description: "Initiate Stage 2 approval (Manual sign-off after Oracle success)."
            - Label: "Merge", Description: "Merge completed track into a target branch (Requires Stage 1 & 2 approval)."
            - Label: "Archive", Description: "Move to archive (Requires Stage 1 & 2 approval)."
            - Label: "Delete", Description: "Permanently delete (Requires Stage 1 & 2 approval)."
            - Label: "Skip", Description: "Do nothing and leave it in the tracks file."

4.  **Handle User Response:**
    *   **If user chooses "Oracle Review":**
        - **header:** "Oracle Model"
        - **question:** "Which model should the Oracle use for this deep audit? (Reasoning models — Pro, Sonnet Thinking, Opus — are strongly recommended. Fast models like Flash may miss subtle correctness issues and are prone to grade inflation on adversarial checks.)"
        - **type:** "choice"
        - **options:** (Populate this dynamically with the models returned by running `agy models`. Annotate reasoning-capable models with `[Recommended for Oracle]`. Example: "Gemini 3.1 Pro [Recommended for Oracle]", "Claude Sonnet 4.6 Thinking [Recommended for Oracle]", "Claude Opus 4.6 [Recommended for Oracle]", "Gemini 3.6 Flash", etc.)
        - **Action:** Transition to the **6.0 ORACLE CODE REVIEW LOOP** protocol.
    *   **If user chooses "User Approval":**
        - **Pre-requisite:** Check if Oracle has already given a "Ready" verdict. If not, inform the user that Oracle approval is required first.
        - **Action:** Ask the user: "The Oracle has approved the changes. Do you provide final manual approval to proceed to cleanup?" (type: "yesno")
        - **Result:** If 'yes', mark the track as fully approved.
    *   **If user chooses "Merge":**
        - **Pre-requisite:** Verify both Stage 1 (Oracle) and Stage 2 (User) approvals are complete.
        - **Target Selection:** Use `ask_user` to select target: `dev`, `main`, `release/v*`.
        - **Action:** `GitWorkflowManager.mergeToTarget(selected_target, track_branch)`.
        - **Post-Merge:** Transition to **Deployment Suggestion**.
    *   **If user chooses "Archive" or "Delete":**
        - **Pre-requisite:** Verify both Stage 1 (Oracle) and Stage 2 (User) approvals are complete. If not, block the action and direct the user to the missing approval stage.
        - **Action (Archive):**
            i.   **Create Archive Directory:** Check for the existence of `superconductor/archive/`. If it does not exist, create it.
            ii.  **Archive Track Folder:** Move the track's folder to `superconductor/archive/<track_id>`.
            iii. **Remove from Tracks File:** Remove the track entry from the **Tracks Registry**.
            iv.  **Commit Changes:** Stage and commit with `chore(superconductor): Archive track '<track_description>'`.
            v.   **Announce Success:** Announce: "Track '<track_description>' has been successfully archived."
        - **Action (Delete):**
            i. **CRITICAL WARNING:** Ask for final confirmation via `ask_user` (yesno).
            ii. **If 'yes'**: Delete track folder, remove from registry, commit with `chore(superconductor): Delete track '<track_description>'`, and announce success.
    *   **If user chooses "Skip":**
        - Announce: "Okay, the completed track will remain in your tracks file for now."

    *   **Deployment Suggestion:**
        - **Action:** Use the **ProjectConfigAnalyzer** to identify potential deployment commands for the `selected_target` branch.
        - **Logic:** `ProjectConfigAnalyzer.analyze('superconductor/tech-stack.md', 'package.json')`.
        - **Suggestion:** `ProjectConfigAnalyzer.suggestDeploymentCommand(selected_target)`.
        - **User Prompt:** If a command is found, ask: "Deployment command discovered for '<selected_target>': '<command>'. Would you like to execute it now?" (type: "yesno").
        - **Execution:** If 'yes', run the command and report status.


---

## 6.0 ORACLE CODE REVIEW LOOP (ADVANCED)
**PROTOCOL: Perform a high-fidelity audit using the selected model.**

1.  **Initialize Oracle:**
    -   Read the `templates/oracle_review_prompt.md` to load the system role and objectives.
    -   Announce: "Initiating Oracle Code Review. Analyzing implementation against Specification, Plan, and Project Standards..."

2.  **Audit Phase:**
    -   The agent (using the user-selected model) executes the audit objectives:
        -   Compare code against `spec.md`.
        -   Verify all `plan.md` tasks are complete.
        -   Check `tech-stack.md` and `code_styleguides/`.
        -   Scan for feature gaps and DRY violations.
    -   **Generate Report:** Output the `Oracle Audit Report` according to the template.

3.  **Adversarial Audit Phase (Mandatory — runs after every standard audit):**
    -   Load `skills/review/SKILL.md` §4.0 Adversarial Audit Protocol.
    -   Execute the full protocol in sequence:
        -   **§4.1 Undefined Path Hunting:** For every conditional block in the diff, find implicit branches. Flag any `if <X>` with no explicit `else` or fallthrough as `CRITICAL`.
        -   **§4.2 Plan Task Integrity:** For every task marked `[x]` in `plan.md`, verify the completion evidence is genuine — not a silent no-op, cached result, or surface-only check.
        -   **§4.3 Test Coverage Legitimacy:** Count new test files in the diff. If behavioral changes were added but zero new tests were written, flag as `HIGH`. Verify "tests passed" means *new code* was covered, not just that old code didn't break.
        -   **§4.4 "Recommended" Label Audit:** For every prompt option or default labeled "Recommended", verify the recommendation is context-qualified, not blanket.
        -   **§4.5 Shenanigan Checklist:** Run all 8 checks — grade inflation, no-op task completions, spec drift, missing else, self-referential verification, hollow tests, optimistic closures, prerequisite+shortcut traps.
    -   **Append findings** from the Adversarial Audit to the Oracle Audit Report under a dedicated `## Adversarial Audit Findings` section.
    -   **CRITICAL:** If the Adversarial Audit finds any issue that the standard Audit Phase missed, the Oracle's final verdict MUST be `Needs Fixes` regardless of the standard audit result.

4.  **Auto-Fix Loop & Remediation:**
    - If the report contains "Auto-Fix Candidates":
        - **Ask for Approval:** "I've identified several auto-fix candidates. Would you like me to apply them now using a TDD loop?" (type: "yesno")
        - **Action:** If yes, for each candidate:
            - Create/Update tests to reproduce the issue or verify the improvement.
            - Apply the suggested diff.
            - Run tests.
            - Commit with message: `fix(superconductor/oracle): [Description of fix]`.
    - If "Needs Fixes" and not auto-fixable (or user prefers manual remediation):
        - **Action:** Transition to **Remediation Phase Generation**.
        - **Protocol:**
            i.   **Extract Feedback:** Identify the specific issues or tasks from the Oracle report that require manual intervention.
            ii.  **Identify Iteration:** Determine the next iteration number (e.g., check `plan.md` for existing `Review Remediation (Iteration X)` phases).
            iii. **Generate Phase:** Use the **PhaseGenerator** utility to append a new `## Review Remediation (Iteration X)` phase to the track's `plan.md`.
            iv.  **Announce Success:** Announce: "Oracle review identified necessary changes. A new 'Review Remediation' phase has been appended to your plan. Please implement the tasks to address the feedback."
    - If the report suggests **Kernel Sync Candidates**:
        - **Ask for Approval:** "The Oracle has identified high-quality reusable components for the `design-os-kernel`. Would you like me to publish them now?" (type: "yesno")
        - **Action:** If yes, save the payload as a JSON file and run `node superconductor/publish_component.js <path_to_payload_json>` to route publication to the Caduceus registry. If Caduceus is not available, fall back to the `mcp_design-os-kernel_publish_vetted_component` tool.
    - If "Ready" verdict:
        - Proceed to finalization.

5.  **Finalization:**
    -   Once the Oracle gives a "Ready" verdict, proceed to the final `TRACK CLEANUP` step (Archive/Delete/Skip).
