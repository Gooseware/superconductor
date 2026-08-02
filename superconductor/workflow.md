# Project Workflow

## Guiding Principles

1. **The Plan is the Source of Truth:** All work must be tracked in `plan.md`
2. **The Tech Stack is Deliberate:** Changes to the tech stack must be documented in `tech-stack.md` *before* implementation
3. **Test-Driven Development:** Write unit tests before implementing functionality
4. **High Code Coverage:** Aim for >80% code coverage for all modules
5. **User Experience First:** Every decision should prioritize user experience
6. **Non-Interactive & CI-Aware:** Prefer non-interactive commands. Use `CI=true` for watch-mode tools (tests, linters) to ensure single execution.
7. **Critically Evaluate Before Extending or Replacing Existing Code:** Before touching any existing module, the implementing agent MUST reason explicitly about both paths and surface that reasoning in the swarm log or a code comment:
   - **Case for Extending:** Why does the existing implementation serve the new requirement well? What is the integration effort and estimated token/time budget?
   - **Case for Replacing/Rebuilding:** Is the existing implementation fundamentally misaligned with the new requirement — in architecture, contract, or performance characteristics? Would extending it produce worse code than a clean implementation? What is the estimated token/time budget?
   - **Decision:** State which path is chosen and why. If the rebuilding case is materially stronger, rebuilding is the correct choice. If the cases are roughly equal, prefer extension to reduce risk and regression surface.
   - This reasoning must be present before any implementation begins. An agent that silently extends OR silently rebuilds without surfacing this analysis is out of compliance with the workflow.

## Task Workflow

All tasks follow a strict lifecycle:

### Headless vs Interactive Mode

The Superconductor engine operates in either Interactive or Headless mode.
- **Interactive (Default):** Requires manual human verification at phase boundaries and utilizes the `ask_user` tool.
- **Headless (`--headless`):** Designed for asynchronous/autonomous factory execution. Bypasses manual prompts if automated tests pass and >80% coverage is achieved. If quality gates fail, it triggers an escalation router fallback.

### Standard Task Workflow

1. **Select Task:** Choose the next available task from `plan.md` in sequential order

2. **Mark In Progress & Load Context:** Before beginning work, edit `plan.md` and change the task from `[ ]` to `[~]`. **CRITICAL:** Ensure you are working on the dedicated track branch (`track/<track_id>`). All implementation work MUST happen on this branch. Using the **Universal File Resolution Protocol**, resolve and read `superconductor/CONTEXT.md` so ubiquitous language is active during implementation.

3. **Write Failing Tests (Red Phase):**
   - Create a new test file for the feature or bug fix.
   - Write one or more unit tests that clearly define the expected behavior and acceptance criteria for the task.
   - **CRITICAL:** Run the tests and confirm that they fail as expected. This is the "Red" phase of TDD. Do not proceed until you have failing tests.

4. **Implement to Pass Tests (Green Phase):**
   - Write the minimum amount of application code necessary to make the failing tests pass.
   - Run the test suite again and confirm that all tests now pass. This is the "Green" phase.

5. **Refactor (Optional but Recommended):**
   - With the safety of passing tests, refactor the implementation code and the test code to improve clarity, remove duplication, and enhance performance without changing the external behavior.
   - Rerun tests to ensure they still pass after refactoring.

6. **Verify Coverage:** Run coverage reports using the project's chosen tools. 
   - **Target: >80% coverage for new code.**

7. **Document Deviations:** If implementation differs from tech stack:
   - **STOP** implementation
   - Update `tech-stack.md` with new design
   - Add dated note explaining the change
   - Resume implementation

8. **Commit Code Changes:**
   - Stage all code changes related to the task.
   - **Frequency: Per Task.**
   - Message format: `track(id): phase - description`.
   - **Task summaries must be included in the Commit Message body.**
   - Propose a clear, concise commit message.
   - Perform the commit.

9. **Get and Record Task Commit SHA:**
    - **Step 9.1: Update Plan:** Read `plan.md`, find the line for the completed task, update its status from `[~]` to `[x]`, and append the first 7 characters of the *just-completed commit's* commit hash.
    - **Step 9.2: Write Plan:** Write the updated content back to `plan.md`.

10. **Commit Plan Update:**
    - **Action:** Stage the modified `plan.md` file.
    - **Action:** Commit this change with a descriptive message (e.g., `superconductor(plan): Mark task 'Create user model' as complete`).

### Phase Completion Verification and Checkpointing Protocol

**Trigger:** This protocol is executed immediately after a task is completed that also concludes a phase in `plan.md`.

1.  **Announce Protocol Start:** Inform the user that the phase is complete and the verification and checkpointing protocol has begun.

2.  **Registry Inclusion Analysis (New):**
    -   **Step 2.1: Analyze Components:** Automatically scan for newly created componentry in this phase.
        -   **New Files Scan:** Check for new files in known component directories (e.g., `src/components`).
        -   **Diff Analysis:** Review `git diff` for new component, class, or logic declarations.
        -   **Theme Usage Scan:** Check for usage of `design-os` or caduceus tokens and primitives.
    -   **Step 2.2: Draft Publication Proposals:** For any high-quality, reusable component identified:
        -   Construct a `ComponentPayload` (including all component files, metadata, and optional comments).
        -   Draft a publication proposal.
        -   Explain the rationale for why this component is a good candidate.
        -   **Action:** If approved, invoke the `RegistryClientRouter` utility to publish the component to the registry (local Caduceus registry if available, else Design OS kernel MCP).
        -   Await user approval before any further registry actions.

3.  **Ensure Test Coverage for Phase Changes:**
    -   **Step 3.1: Determine Phase Scope:** To identify the files changed in this phase, you must first find the starting point. Read `plan.md` to find the Git commit SHA of the *previous* phase's checkpoint. If no previous checkpoint exists, the scope is all changes since the first commit.
    -   **Step 3.2: List Changed Files:** Execute `git diff --name-only <previous_checkpoint_sha> HEAD` to get a precise list of all files modified during this phase.
    -   **Step 3.3: Verify and Create Tests:** For each file in the list:
        -   **CRITICAL:** First, check its extension. Exclude non-code files (e.g., `.json`, `.md`, `.yaml`).
        -   For each remaining code file, verify a corresponding test file exists.
        -   If a test file is missing, you **must** create one. Before writing the test, **first, analyze other test files in the repository to determine the correct naming convention and testing style.** The new tests **must** validate the functionality described in this phase's tasks (`plan.md`).

4.  **Execute Automated Tests with Proactive Debugging:**
    -   Before execution, you **must** announce the exact shell command you will use to run the tests.
    -   **Example Announcement:** "I will now run the automated test suite to verify the phase. **Command:** `CI=true npm test`"
    -   Execute the announced command.
    -   If tests fail, you **must** inform the user and begin debugging. You may attempt to propose a fix a **maximum of two times**. If the tests still fail after your second proposed fix, you **must stop**, report the persistent failure, and ask the user for guidance.

5.  **Propose a Detailed, Actionable Manual Verification Plan:**
    -   **CRITICAL:** To generate the plan, first analyze `product.md`, `product-guidelines.md`, and `plan.md` to determine the user-facing goals of the completed phase.
    -   You **must** generate a step-by-step plan that walks the user through the verification process, including any necessary commands and specific, expected outcomes.
    -   The plan you present to the user **must** follow this format:

        **For a Frontend Change:**
        ```
        The automated tests have passed. For manual verification, please follow these steps:

        **Manual Verification Steps:**
        1.  **Start the development server with the command:** `npm run dev`
        2.  **Open your browser to:** `http://localhost:3000`
        3.  **Confirm that you see:** The new user profile page, with the user's name and email displayed correctly.
        ```

        **For a Backend Change:**
        ```
        The automated tests have passed. For manual verification, please follow these steps:

        **Manual Verification Steps:**
        1.  **Ensure the server is running.**
        2.  **Execute the following command in your terminal:** `curl -X POST http://localhost:8080/api/v1/users -d '{"name": "test"}'`
        3.  **Confirm that you receive:** A JSON response with a status of `201 Created`.
        ```

6.  **Await Explicit User Feedback (Interactive Mode Only):**
    -   **Headless Mode:** Skip this step entirely if tests pass and coverage is >80%.
    -   **Interactive Mode:** 
        -   **Intermediate Phases:** If this is NOT the final implementation phase of the track, do NOT pause or ask the user for confirmation. Automatically approve the checkpoint and proceed to Step 7.
        -   **Final Implementation Phase:** If this is the final implementation phase before review/integration, present the manual verification plan and ask: "**Does this meet your expectations? Please confirm with yes or provide feedback on what needs to be changed.**" PAUSE and await the user's response. Do not proceed without confirmation.

7.  **Swarm Phase Gate Review (Mandatory):**
    -   Execute the Swarm Phase Gate using a 3-reviewer Flash panel.
    -   Provide only the minimized context (task spec, git diff, modified files) to the panel.
    -   **Streaming Review Protocol:** The Reviewer panel must stream its diagnostic output via Server-Sent Events (SSE). If a `CRITICAL` finding is detected dynamically during the stream, the orchestrator MUST trigger an early abort (halting immediately to save time and tokens) and initiate remediation.
    -   The checkpointing process is blocked until the Phase Gate returns a PASS (zero CRITICAL findings).
    -   If CRITICAL findings are found, auto-remediate up to 2 times. If it still fails, escalate to manual intervention.

8.  **Create Checkpoint Commit:**
    -   Stage all changes. If no changes occurred in this step, proceed with an empty commit.
    -   Perform the commit with a clear and concise message (e.g., `superconductor(checkpoint): Checkpoint end of Phase X`).

9.  **Attach Auditable Verification Report using Git Notes:**
    -   **Step 9.1: Draft Note Content:** Create a detailed verification report including the automated test command, the manual verification steps, and the user's confirmation.
    -   **Step 9.2: Attach Note:** Use the `git notes` command and the full commit hash from the previous step to attach the full report to the checkpoint commit.
    -   **Step 9.3: Attach Quality Note:** Use `QualityNotesWriter.appendPhaseNote()` to write a structured JSON quality payload to `refs/notes/quality`. Ensure the payload follows the `{ track_id, phase, timestamp, swarm_pass_rate, retry_count, critical_findings, advisory_findings, token_usage_estimate, abi_tweaks_applied[] }` schema.

10. **Get and Record Phase Checkpoint SHA:**
    -   **Step 10.1: Get Commit Hash:** Obtain the hash of the *just-created checkpoint commit* (`git log -1 --format="%H"`).
    -   **Step 10.2: Update Plan:** Read `plan.md`, find the heading for the completed phase, and append the first 7 characters of the commit hash in the format `[checkpoint: <sha>]`.
    -   **Step 10.3: Write Plan:** Write the updated content back to `plan.md`.

11. **Commit Plan Update:**
    - **Action:** Stage the modified `plan.md` file.
    - **Action:** Commit this change with a descriptive message following the format `superconductor(plan): Mark phase '<PHASE NAME>' as complete`.

12. **Announce Completion:** Inform the user that the phase is complete and the checkpoint has been created, with the detailed verification report attached as a git note.

### Oracle Code Review Loop (Advanced Verification)

**Trigger:** Prompted during the "Track Cleanup" phase of the implementation lifecycle.

1.  **Selection:** Choose between "Pro" or "Flash" models for the audit.
2.  **Audit Scope:**
    -   **Spec Alignment:** Full fulfillment of `spec.md`.
    -   **Plan Verification:** All `plan.md` tasks complete.
    -   **Style & Tech Compliance:** Strict adherence to standards.
    -   **Feature Gap Identification:** Identifying overlooked risks or edge cases.
    -   **DRY & Reusability:** Detecting duplication and proposing reusable abstractions.
3.  **Auto-Fix Loop:** Automatically apply suggested fixes using a Red-Green-Refactor cycle upon approval.
4.  **Final Verdict:** Transition to cleanup once a "Ready" verdict is achieved.

### Multi-Modal Vision Oracle Protocol

The Vision Oracle enhances code review by visually analyzing UI components during the validation phase.
1.  **Capture:** The orchestrator captures a base64 screenshot of the UI component using the Playwright harness.
2.  **Vision Analysis:** The screenshot is fed into the Vision Oracle (Gemini 1.5 Pro) along with the Astryx design tokens.
3.  **Critique:** The Vision Oracle critiques the UI against the design tokens (e.g., verifying hex colors, padding, typography, and glassmorphism effects).
4.  **Feedback:** Visual deviations are logged as UI findings, blocking the Phase Gate until the UI matches the design specification perfectly.

### Quality Gates

Before marking any task complete, verify:

- [ ] All tests pass
- [ ] Code coverage meets requirements (>80%)
- [ ] Code follows project's code style guidelines (as defined in `code_styleguides/`)
- [ ] All public functions/methods are documented (e.g., docstrings, JSDoc, GoDoc)
- [ ] Type safety is enforced (e.g., type hints, TypeScript types, Go types)
- [ ] No linting or static analysis errors (using the project's configured tools)
- [ ] Works correctly on mobile (if applicable)
- [ ] Documentation updated if needed
- [ ] No security vulnerabilities introduced

## Development Commands

**AI AGENT INSTRUCTION: This section should be adapted to the project's specific language, framework, and build tools.**

### Setup
```bash
# Example: Commands to set up the development environment (e.g., install dependencies, configure database)
# e.g., for a Node.js project: npm install
# e.g., for a Go project: go mod tidy
```

### Daily Development
```bash
# Example: Commands for common daily tasks (e.g., start dev server, run tests, lint, format)
# e.g., for a Node.js project: npm run dev, npm test, npm run lint
# e.g., for a Go project: go run main.go, go test ./..., go fmt ./...
```

### Before Committing
```bash
# Example: Commands to run all pre-commit checks (e.g., format, lint, type check, run tests)
# e.g., for a Node.js project: npm run check
# e.g., for a Go project: make check (if a Makefile exists)
```

## Testing Requirements

### Unit Testing
- Every module must have corresponding tests.
- Use appropriate test setup/teardown mechanisms (e.g., fixtures, beforeEach/afterEach).
- Mock external dependencies.
- Test both success and failure cases.

### Integration Testing
- Test complete user flows
- Verify database transactions
- Test authentication and authorization
- Check form submissions

### Mobile Testing
- Test on actual iPhone when possible
- Use Safari developer tools
- Test touch interactions
- Verify responsive layouts
- Check performance on 3G/4G

## Code Review Process

### Self-Review Checklist
Before requesting review:

1. **Functionality**
   - Feature works as specified
   - Edge cases handled
   - Error messages are user-friendly

2. **Code Quality**
   - Follows style guide
   - DRY principle applied
   - Clear variable/function names
   - Appropriate comments

3. **Testing**
   - Unit tests comprehensive
   - Integration tests pass
   - Coverage adequate (>80%)

4. **Security**
   - No hardcoded secrets
   - Input validation present
   - SQL injection prevented
   - XSS protection in place

5. **Performance**
   - Database queries optimized
   - Images optimized
   - Caching implemented where needed

6. **Mobile Experience**
   - Touch targets adequate (44x44px)
   - Text readable without zooming
   - Performance acceptable on mobile
   - Interactions feel native

## Commit Gate

- Sequential mode and swarm mode both require the Quorum → Remediate → Quorum loop to complete before the finalization commit step.
- The finalization commit (`chore(superconductor): Mark track X as complete`) is explicitly gated — it MUST NOT run until all 4 reviewers report `RESOLVED`.
- After the Quorum loop completes and all reviewers are `RESOLVED`, the Orchestrator MUST invoke `SwarmAuthorizer.generateTrailer(reviewerConvIds)` (via `packages/superconductor-core/src/track/swarm-authorizer.ts` or equivalent execution) and append the authorization trailer to the commit message before the finalization commit.

## Commit Guidelines

### Message Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests
- `chore`: Maintenance tasks

### Examples
```bash
git commit -m "feat(auth): Add remember me functionality"
git commit -m "fix(posts): Correct excerpt generation for short posts"
git commit -m "test(comments): Add tests for emoji reaction limits"
git commit -m "style(mobile): Improve button touch targets"
```

## Definition of Done

A task is complete when:

1. All code implemented to specification
2. Unit tests written and passing
3. Code coverage meets project requirements
4. Documentation complete (if applicable)
5. Code passes all configured linting and static analysis checks
6. Works beautifully on mobile (if applicable)
7. Implementation notes added to `plan.md`
8. Changes committed with proper message
9. Git note with task summary attached to the commit

## Emergency Procedures

### Critical Bug in Production
1. Create hotfix branch from main
2. Write failing test for bug
3. Implement minimal fix
4. Test thoroughly including mobile
5. Deploy immediately
6. Document in plan.md

### Data Loss
1. Stop all write operations
2. Restore from latest backup
3. Verify data integrity
4. Document incident
5. Update backup procedures

### Security Breach
1. Rotate all secrets immediately
2. Review access logs
3. Patch vulnerability
4. Notify affected users (if any)
5. Document and update security procedures

### Track Integration & Finalization (Mandatory)

**Every track MUST conclude with a final phase dedicated to merging the validated work into the project's preferred target branch (`dev` or `main`).**

1.  **Selection of Target:** Refer to `tech-stack.md` for the project's `Target Branch` preference.
2.  **Merge Command:** Use `GitWorkflowManager.mergeToTarget(target_branch, track_branch)`.
3.  **Final Task:** Every `plan.md` MUST include this as its absolute last task:
    - `- [ ] Task: Integrate track '<track_id>' into <target_branch> branch.`

## Deployment Workflow

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Coverage >80%
- [ ] No linting errors
- [ ] Mobile testing complete
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Backup created

### Deployment Steps
1. Merge the track branch (`track/<track_id>`) into `main` (or `master`).
2. Tag release with version
3. Push to deployment service
4. Run database migrations
5. Verify deployment
6. Test critical paths
7. Monitor for errors

### Post-Deployment
1. Monitor analytics
2. Check error logs
3. Gather user feedback
4. Plan next iteration

## Continuous Improvement

- Review workflow weekly
- Update based on pain points
- Document lessons learned
- Optimize for user happiness
- Keep things simple and maintainable
