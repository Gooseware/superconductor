# Superconductor Extension for Gemini CLI

**Measure twice, code once.**

Superconductor is a Gemini CLI extension that enables **Context-Driven Development**. It turns the Gemini CLI into a proactive project manager that follows a strict protocol to specify, plan, and implement software features and bug fixes.

Instead of just writing code, Superconductor ensures a consistent, high-quality lifecycle for every task: **Context -> Spec & Plan -> Implement**.

The philosophy behind Superconductor is simple: control your code. By treating context as a managed artifact alongside your code, you transform your repository into a single source of truth that drives every agent interaction with deep, persistent project awareness.

## Features

- **Plan before you build**: Create specs and plans that guide the agent for new and existing codebases.
- **Maintain context**: Ensure AI follows style guides, tech stack choices, and product goals.
- **Iterate safely**: Review plans before code is written, keeping you firmly in the loop.
- **Work as a team**: Set project-level context for your product, tech stack, and workflow preferences that become a shared foundation for your team.
- **Build on existing projects**: Intelligent initialization for both new (Greenfield) and existing (Brownfield) projects.
- **Smart revert**: A git-aware revert command that understands logical units of work (tracks, phases, tasks) rather than just commit hashes.

## Installation

Install the Superconductor extension by running the following command from your terminal:

```bash
gemini extensions install https://github.com/gooseware/superconductor --auto-update
```

The `--auto-update` is optional: if specified, it will update to new versions as they are released.

## Usage

Superconductor is designed to manage the entire lifecycle of your development tasks.

**Note on Token Consumption:** Superconductor's context-driven approach involves reading and analyzing your project's context, specifications, and plans. This can lead to increased token consumption, especially in larger projects or during extensive planning and implementation phases. You can check the token consumption in the current session by running `/stats model`.

### 1. Set Up the Project (Run Once)

When you run `/superconductor:setup`, Superconductor helps you define the core components of your project context. This context is then used for building new components or features by you or anyone on your team.

- **Product**: Define project context (e.g. users, product goals, high-level features).
- **Product guidelines**: Define standards (e.g. prose style, brand messaging, visual identity).
- **Tech stack**: Configure technical preferences (e.g. language, database, frameworks).
- **Workflow**: Set team preferences (e.g. TDD, commit strategy). Uses [workflow.md](templates/workflow.md) as a customizable template.

**Generated Artifacts:**
- `superconductor/product.md`
- `superconductor/product-guidelines.md`
- `superconductor/tech-stack.md`
- `superconductor/workflow.md`
- `superconductor/code_styleguides/`
- `superconductor/tracks.md`

```bash
/superconductor:setup
```

### 2. Start a New Track (Feature or Bug)

When you’re ready to take on a new feature or bug fix, run `/superconductor:newTrack`. This initializes a **track** — a high-level unit of work. Superconductor helps you generate two critical artifacts:

- **Specs**: The detailed requirements for the specific job. What are we building and why?
- **Plan**: An actionable to-do list containing phases, tasks, and sub-tasks.

**Generated Artifacts:**
- `superconductor/tracks/<track_id>/spec.md`
- `superconductor/tracks/<track_id>/plan.md`
- `superconductor/tracks/<track_id>/metadata.json`

```bash
/superconductor:newTrack
# OR with a description
/superconductor:newTrack "Add a dark mode toggle to the settings page"
```

### 3. Implement the Track

Once you approve the plan, run `/superconductor:implement`. Your coding agent then works through the `plan.md` file, checking off tasks as it completes them.

**Updated Artifacts:**
- `superconductor/tracks.md` (Status updates)
- `superconductor/tracks/<track_id>/plan.md` (Status updates)
- Project context files (Synchronized on completion)

```bash
/superconductor:implement
```

Superconductor will:
1.  Select the next pending task.
2.  Follow the defined workflow (e.g., TDD: Write Test -> Fail -> Implement -> Pass).
3.  Update the status in the plan as it progresses.
4.  **Verify Progress**: Guide you through a manual verification step at the end of each phase to ensure everything works as expected.

During implementation, you can also:

- **Check status**: Get a high-level overview of your project's progress.
  ```bash
  /superconductor:status
  ```
- **Revert work**: Undo a feature or a specific task if needed.
  ```bash
  /superconductor:revert
  ```

- **Review work**: Review completed work against guidelines and the plan.
  ```bash
  /superconductor:review
  ```

## Commands Reference

| Command | Description | Artifacts |
| :--- | :--- | :--- |
| `/superconductor:setup` | Scaffolds the project and sets up the Superconductor environment. Run this once per project. | `superconductor/product.md`<br>`superconductor/product-guidelines.md`<br>`superconductor/tech-stack.md`<br>`superconductor/workflow.md`<br>`superconductor/tracks.md` |
| `/superconductor:newTrack` | Starts a new feature or bug track. Generates `spec.md` and `plan.md`. | `superconductor/tracks/<id>/spec.md`<br>`superconductor/tracks/<id>/plan.md`<br>`superconductor/tracks.md` |
| `/superconductor:implement` | Executes the tasks defined in the current track's plan. | `superconductor/tracks.md`<br>`superconductor/tracks/<id>/plan.md` |
| `/superconductor:status` | Displays the current progress of the tracks file and active tracks. | Reads `superconductor/tracks.md` |
| `/superconductor:revert` | Reverts a track, phase, or task by analyzing git history. | Reverts git history |
| `/superconductor:review` | Reviews completed work against guidelines and the plan. | Reads `plan.md`, `product-guidelines.md` |

## Resources

- [Gemini CLI extensions](https://geminicli.com/docs/extensions/): Documentation about using extensions in Gemini CLI
- [GitHub issues](https://github.com/gemini-cli-extensions/superconductor/issues): Report bugs or request features

## Legal

- License: [Apache License 2.0](LICENSE)
