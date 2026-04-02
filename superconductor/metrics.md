# Internal Performance and Error Metrics

This document defines the metrics used to measure the performance and identify areas for improvement within the Superconductor extension and the applications it manages.

## Harness Error Metrics
These metrics track technical failures within the Gemini CLI harness.

- **Tool Call Hallucinations:** Number of times a non-existent tool is called.
- **Path Resolution Failures:** Number of times a file operation fails due to incorrect relative or absolute path assumptions.
- **Edit Match Failures:** Frequency of `replace` tool calls failing to find the specified `old_string`.
- **Policy/Permission Denials:** Number of tool calls blocked by the security policy (e.g., restricted shell commands in Plan Mode).
- **Execution Interruptions:** Frequency of operations halting due to unrecoverable tool errors.

## Extension Improvement Metrics
These metrics measure the efficiency and accuracy of the Superconductor agent logic.

- **Context Token Efficiency:** Average token usage per task completion.
- **Read Redundancy:** Number of times the same file is read within a single task lifecycle.
- **Self-Correction Success Rate:** Frequency of successful recoveries after an initial tool failure.
- **Task Latency:** Time taken from task selection to successful verification.
- **Draft Accuracy:** Number of user revisions required for generated `spec.md` or `plan.md` files.

## Application Improvement Metrics
These metrics track the quality and health of the target application being developed.

- **Test Pass Rate:** Percentage of automated tests passing across the project.
- **Lint/Static Analysis Density:** Number of static analysis warnings/errors per 100 lines of code.
- **Code Coverage:** Percentage of code exercised by tests (Target: >80%).
- **Documentation Coverage:** Percentage of public functions/classes with valid documentation.
- **Component Reusability:** Number of components identified and proposed for `design-os-kernel` inclusion.
