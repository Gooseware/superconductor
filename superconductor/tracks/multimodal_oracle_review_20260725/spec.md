# Specification: Streaming & Multi-Modal Oracle Review Panel

## Overview
Rewrite the Oracle and Reviewer panel implementations to support cutting-edge capabilities: streaming static analysis (for real-time feedback) and multi-modal UI review (allowing the Oracle to evaluate visual screenshots of the generated application UI against the design tokens).

## Functional Requirements
1. **Streaming Analysis:** The Review panel (`superconductor-reviewer`) must stream its diagnostic output as it parses code, allowing early aborts if critical vulnerabilities (like SQLi) are detected immediately.
2. **Multi-Modal UI Review:** Integrate Playwright/Puppeteer into the Oracle review loop to automatically snap UI components in a headless browser and feed the base64 images into the Gemini 1.5 Pro vision model.
3. **Design OS Compliance:** The Vision Oracle must cross-reference the screenshots against the Astryx Theme parameters to check for visual drifts, alignment issues, and color contrast.

## Non-Functional Requirements
- **Latency:** Streaming must provide a time-to-first-byte (TTFB) under 500ms for review feedback.
- **Token Cost:** Multi-modal screenshots must be optimized/downscaled to preserve tokens while retaining enough fidelity for design review.

## Acceptance Criteria
- [ ] Review panel streams results to the swarm log in real-time.
- [ ] Oracle correctly flags a visual CSS misalignment when provided a broken component.
