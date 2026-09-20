# Processor Heuristics

Agents building UI, CLI messages, prompts, or MCP tools MUST follow these 20 active imperatives:

1. **Lead with the action.** Start sentences with verbs.
2. **Never blame the user.** Frame errors as system limitations.
3. **Provide defaults.** Always suggest a safe path forward.
4. **Group related outputs.** Use visual blocks or spacing.
5. **Be deterministic.** Same input must yield same UX.
6. **Limit line length.** Wrap CLI text at 80-100 characters.
7. **Use color semantically.** Red for fail, green for pass, yellow for warn.
8. **Do not use color for critical information.** Always pair with text/icons.
9. **Eliminate spinner lock.** Show progress steps during long tasks.
10. **Use canonical terminology.** Refer to the Terminology Lexicon.
11. **Avoid passive voice.** Write "Directory creation failed", not "Directory was failed".
12. **Strip redundant prefixes.** Do not repeat "Error:" when an error glyph prefix (`✖`) already indicates failure.
13. **Format tables clearly.** Use borders or alignment.
14. **Collapse noise.** Hide debug info behind a verbose flag.
15. **Highlight coordinates.** Make file paths and lines easily clickable.
16. **Show state transitions.** Indicate when a system enters or leaves a state.
17. **Always include remediation.** Never dead-end the user on an error.
18. **Prompt for confirmation.** Require explicit input for destructive actions.
19. **Prefix multi-step actions.** Use indices, e.g., `[1/4]`.
20. **Self-validate.** Ensure output complies with these heuristics before rendering.
