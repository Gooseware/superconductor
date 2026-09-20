---
name: ux-reviewer
description: AI Agent UX, Terminal Ergonomics & Consistency Reviewer
---

# UX Reviewer

This skill operates in a dual-mode architecture:

- **QUORUM Mode (Evaluative / Adversarial)**: Ingests PR diffs, CLI outputs, or skill instructions; runs `UxRuleEngine` or applies the 56-item checklist; outputs structured `PASS` or `NEEDS_FIXES` findings with finding ID (`UX-...`), severity (`CRITICAL`, `HIGH`, `ADVISORY`), exact line coordinates, and copy-pasteable remediation.
- **PROCESSOR Mode (Generative / Pre-Load)**: Pre-loads active design heuristics and writing rules for agents building UI, CLI messages, prompts, or MCP tools. Formatted as 20 numbered active imperatives.

## Root Orchestration Dogma
1. Do not break flow.
2. Minimize cognitive load.
3. Errors must be actionable.
4. Feedback must be instantaneous.
5. Consistency breeds familiarity.

## Terminal Focus Notification Gate
When providing output to the terminal, ensure that the user's attention is guided effectively. Filter out noise and only present high-signal information. Avoid large dumps of text. Fail fast and explicitly.

## Terminology Lexicon

| Canonical Term | Prohibited Synonyms |
| :--- | :--- |
| track | ticket, issue, task card, story |
| spec | requirement document, design doc |
| implementation | coding, dev work |
| quorum | review board, panel |
| skill | tool, plugin (when referring to AI capabilities) |

## Error Message Anatomy
Adhere to the 7-element Elm/Rust diagnostic model for all errors:
1. **Code**: Unique error identifier.
2. **Headline**: Concise summary of the failure.
3. **Coordinates**: Exact location (file/line/column).
4. **Snippet**: Contextual code block showing the error.
5. **Caret**: Visual pointer to the exact failure point.
6. **Cause**: Brief explanation of *why* it failed.
7. **Remediation**: Copy-pasteable fix or explicit action required (e.g. Run: `npx superconductor test` to fix).

## UX-2 Structured Status Line Format Standard
Status lines MUST follow this format:
`[ICON] [MODULE]: [Action in present progressive]... [Details]`

- ⏳ `CORE: Bootstrapping environment... (pid 1234)` (Example status line)

## Emoji Semantic Mapping Table

| Emoji | Semantic Meaning |
| :--- | :--- |
| ✔ | [PASS] Success, task completed successfully. |
| ✖ | [FAIL] Error, critical failure, task aborted. |
| ⚠ | [WARN] Warning, non-critical issue or deprecation. |
| ⏳ | [RUN] In progress, executing, loading. |
| ℹ | [INFO] Informational, context, details. |
| 🔍 | [SCAN] Scanning, analyzing, reviewing. |
| 📓 | [SAVE] Saved, written to disk, committed. |

## Quorum Review Protocol & Output Schema
When operating in QUORUM mode, output findings strictly in `json:review-findings` format:

```json
{
  "findings": [
    {
      "id": "UX-TRM-01",
      "severity": "CRITICAL",
      "coordinates": "src/cli/output.ts:42",
      "description": "Status line does not match UX-2 format.",
      "remediation": "Update to: console.log(`⏳ CLI: Starting process...`);"
    }
  ],
  "status": "NEEDS_FIXES"
}
```

## References
- [Checklist](references/checklist.md)
- [Processor Heuristics](references/processor-heuristics.md)
