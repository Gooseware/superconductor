---
name: worktrunk
description: Use when you need to manage Git worktrees for parallel agent workflows or complex multi-branch tasks. Provides a seamless interface over native git worktrees using the `wt` CLI.
---

# Worktrunk Skill

Worktrunk is a CLI for Git worktree management, designed specifically to support parallel AI agent workflows and complex branching. It wraps native git worktrees in an intuitive interface.

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
