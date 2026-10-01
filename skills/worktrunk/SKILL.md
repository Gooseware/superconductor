---
name: worktrunk
description: Use when you need to manage Git worktrees for parallel agent workflows or complex multi-branch tasks. Provides a seamless interface over native git worktrees using the `wt` CLI.
---

# Worktrunk Skill

Worktrunk is a CLI for Git worktree management, designed specifically to support parallel AI agent workflows and complex branching. It wraps native git worktrees in an intuitive interface.

## The Prime Directive: Dynamic Tool Detection & Installation

Before executing any `wt` commands, verify that `wt` is installed and available in the executable PATH.

### Preflight Check
Run verification command:
```bash
which wt || command -v wt
```

### Interactive Prompt on Missing Binary
If `wt` is missing: **DO NOT fail silently or crash.** Pause execution and present an interactive prompt to the user using `ask_user`:

> "Worktrunk (`wt`) is not installed on this system. It is required for lightning-fast Git worktree isolation for parallel agent swarms."

Present the following options:
1. **(Recommended) Install via cargo:** `cargo install worktrunk` (or `cargo install worktrunk@0.68.0 --locked`)
2. **Download latest precompiled release binary to `~/.local/bin/wt`:**
   ```bash
   mkdir -p ~/.local/bin
   # Download appropriate binary from https://github.com/max-si-hed/worktrunk/releases
   curl -fsSL -o ~/.local/bin/wt <release-url>
   chmod +x ~/.local/bin/wt
   ```
3. **Skip (fallback to native git worktree):**
   Continue using native `git worktree` commands directly.

### Execution & Verification
On user approval of installation (Option 1 or Option 2):
1. Execute the approved installation command.
2. Ensure `~/.local/bin` (and `~/.cargo/bin`) is in PATH:
   ```bash
   export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
   ```
3. Verify the installation succeeded:
   ```bash
   wt --version
   ```
   Confirm output displays a valid version number before proceeding with worktree operations.

### Native Git Worktree Fallback (Option 3)
If the user selects "Skip":
- **Create & switch branch worktree:**
  ```bash
  git worktree add -b <new-branch-name> .worktrees/<new-branch-name> <base-branch>
  ```
- **List active worktrees:**
  ```bash
  git worktree list
  ```
- **Remove worktree:**
  ```bash
  git worktree remove .worktrees/<branch-name>
  git branch -d <branch-name>
  ```

## Commands

Use the `wt` command to interact with Worktrunk.

### Switching & Creating Worktrees
Instead of typing the branch name multiple times with plain git, use:

- **Switch to an existing worktree by branch name:**
  ```bash
  wt switch <branch-name>
  ```
- **Create a new worktree and branch, then switch to it:**
  ```bash
  wt switch -c <new-branch-name>
  ```
- **Create a new worktree and run a command immediately (e.g. start an agent):**
  ```bash
  wt switch -c -x <command> <new-branch-name>
  ```

### Managing Worktrees

- **List active worktrees with status:**
  ```bash
  wt list
  ```
- **Clean up the current worktree (removes worktree and branch):**
  ```bash
  wt remove
  ```
- **Clean up a specific worktree by branch name:**
  ```bash
  wt remove <branch-name>
  ```

## Best Practices
- When spawning subagents to work on different features in parallel, always use `wt switch -c <branch-name>` to isolate their working directories from `main`.
- Worktrees are addressed by branch name; you do not need to manually compute or specify the file paths.
- Always run `wt remove` to clean up a feature branch's worktree once it has been successfully merged into `main` and is no longer needed.
