# UX Reviewer Checklist

Full 56-item checklist across 8 groups for QUORUM mode evaluation.

## UX-OUT (Output Formatting)
1. **UX-OUT-01** [CRITICAL]: No naked print statements. All outputs route through UI layer.
2. **UX-OUT-02** [HIGH]: Max 80 characters per line in terminal outputs.
3. **UX-OUT-03** [HIGH]: Use whitespace to chunk logical blocks.
4. **UX-OUT-04** [ADVISORY]: Strip trailing whitespace.
5. **UX-OUT-05** [CRITICAL]: Never output raw stack traces directly to the user.
6. **UX-OUT-06** [HIGH]: Separate stdout and stderr cleanly.
7. **UX-OUT-07** [HIGH]: Respect `--quiet` and `--verbose` flags.

## UX-TRM (Terminal Ergonomics)
8. **UX-TRM-01** [CRITICAL]: Follow UX-2 Structured Status Line Format precisely.
9. **UX-TRM-02** [HIGH]: Support terminal color stripping (NO_COLOR env var).
10. **UX-TRM-03** [HIGH]: Provide interactive spinners for processes > 1 second.
11. **UX-TRM-04** [ADVISORY]: Clean up spinners on exit or interruption.
12. **UX-TRM-05** [HIGH]: Ensure prompts default to safe choices (e.g., [Y/n] where Y is non-destructive).
13. **UX-TRM-06** [CRITICAL]: Use bold text exclusively for headings or critical variables.
14. **UX-TRM-07** [HIGH]: Clear screen only when launching full-screen apps, not inline CLI.

## UX-INS (Instruction & Copy)
15. **UX-INS-01** [CRITICAL]: Write in active voice.
16. **UX-INS-02** [HIGH]: Front-load conditions (e.g., "To exit, press Q" instead of "Press Q to exit").
17. **UX-INS-03** [HIGH]: Use imperative mood for actionable steps.
18. **UX-INS-04** [ADVISORY]: Avoid filler words (please, kindly).
19. **UX-INS-05** [CRITICAL]: Never blame the user.
20. **UX-INS-06** [HIGH]: Maintain consistent capitalization (Sentence case for descriptions).
21. **UX-INS-07** [HIGH]: Use code blocks for copy-pasteable commands.

## UX-VIS (Visual Hierarchy)
22. **UX-VIS-01** [HIGH]: Dim secondary information.
23. **UX-VIS-02** [CRITICAL]: Highlight variables, paths, and URLs.
24. **UX-VIS-03** [HIGH]: Use nested indentation for parent-child data.
25. **UX-VIS-04** [ADVISORY]: Frame summary outputs in boxes if > 3 lines.
26. **UX-VIS-05** [HIGH]: Align table columns.
27. **UX-VIS-06** [HIGH]: Provide a summary line at the end of large operations.
28. **UX-VIS-07** [CRITICAL]: Red is for failure, green for success. No alternative semantics.

## UX-COG (Cognitive Load)
29. **UX-COG-01** [CRITICAL]: No wall of text. Break up paragraphs.
30. **UX-COG-02** [HIGH]: Expose max 3 primary options to the user at a time.
31. **UX-COG-03** [HIGH]: Provide an escape hatch (Ctrl+C handling must be explicit).
32. **UX-COG-04** [ADVISORY]: Display time elapsed for long tasks.
33. **UX-COG-05** [HIGH]: Show progression steps (e.g., [1/5]).
34. **UX-COG-06** [CRITICAL]: Retain context in multi-step flows.
35. **UX-COG-07** [HIGH]: Use human-readable byte sizes (e.g., 1.2 MB, not raw unformatted integers like 1,258,291 B).

## UX-SCH (Schema & Error Handling)
36. **UX-SCH-01** [CRITICAL]: Enforce the 7-element Elm/Rust diagnostic model.
37. **UX-SCH-02** [HIGH]: Error IDs must be uniquely searchable.
38. **UX-SCH-03** [CRITICAL]: Remediation steps must be executable or copy-pasteable.
39. **UX-SCH-04** [HIGH]: Distinguish between user errors and system failures.
40. **UX-SCH-05** [ADVISORY]: Log detailed errors to disk and show concise error in CLI.
41. **UX-SCH-06** [HIGH]: Validate inputs immediately before deep processing.
42. **UX-SCH-07** [CRITICAL]: Fail fast on missing dependencies.

## UX-EMJ (Emoji Semantics)
43. **UX-EMJ-01** [CRITICAL]: Adhere strictly to the Emoji Semantic Mapping Table.
44. **UX-EMJ-02** [HIGH]: One emoji per line maximum.
45. **UX-EMJ-03** [HIGH]: Emojis must be placed at the start of the line.
46. **UX-EMJ-04** [ADVISORY]: Leave exactly one space after an emoji.
47. **UX-EMJ-05** [CRITICAL]: Fallback to text prefixes (e.g., [FAIL]) if emojis are not supported.
48. **UX-EMJ-06** [HIGH]: No custom emojis outside the semantic table.
49. **UX-EMJ-07** [HIGH]: Use ℹ for neutral information only.

## UX-SMP (Simplicity & Lexicon)
50. **UX-SMP-01** [CRITICAL]: Adhere strictly to the Terminology Lexicon.
51. **UX-SMP-02** [HIGH]: Avoid jargon unless addressing developers specifically.
52. **UX-SMP-03** [ADVISORY]: Combine redundant status messages.
53. **UX-SMP-04** [HIGH]: Do not ask the user for information the system can deduce.
54. **UX-SMP-05** [CRITICAL]: One command must map to one primary outcome.
55. **UX-SMP-06** [HIGH]: Prefer declarative flags (`--force`) over interactive prompts in scripts.
56. **UX-SMP-07** [CRITICAL]: Ensure output satisfies UX-Reviewer constraints before rendering.
