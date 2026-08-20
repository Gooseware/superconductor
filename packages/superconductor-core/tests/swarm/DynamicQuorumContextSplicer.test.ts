import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import {
  DynamicQuorumContextSplicer,
  ReviewerRole,
  SpliceOptions
} from '../../src/swarm/DynamicQuorumContextSplicer.js';
import { LanguagePersonaResolver } from '../../src/swarm/LanguagePersonaResolver.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('DynamicQuorumContextSplicer', () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quorum-splicer-test-'));
    skillsDir = path.join(tempDir, 'skills', 'personas');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Mock rust-reviewer SKILL.md
    const rustDir = path.join(skillsDir, 'rust-reviewer');
    fs.mkdirSync(rustDir, { recursive: true });
    fs.writeFileSync(
      path.join(rustDir, 'SKILL.md'),
      `---
name: rust-reviewer
description: Rust domain expert
---

# Rust Reviewer Persona

## 1. Pre-Review Static Analysis Commands
\`\`\`bash
cargo clippy -- -D warnings
cargo audit
\`\`\`

## 2. Quorum Review Rubrics (4 Universal Domains)

### 2.1 Security Rubric
- **Unsafe Block Audit (MANDATORY \`// SAFETY:\` Comments)**:
  - Every unsafe block must have a // SAFETY: comment.
  - Raw pointer dereferencing alignment checks.

### 2.2 Correctness Rubric
- **Async Cancellation Safety**:
  - In tokio::select!, branches dropped must be cancel-safe.
- **Cross-Await Lock Contention**:
  - Never hold std::sync::MutexGuard across await points.

### 2.3 Adversarial & Boundary Testing Rubric
- **Resource Exhaustion**:
  - Guard unbounded Vec::with_capacity(n).

### 2.4 Regression & Performance Rubric
- **Zero-Cost Abstractions**:
  - Iterator pipelines without intermediate allocations.

## 3. Idiomatic Patterns vs. Anti-Patterns
### ❌ Anti-Pattern
Holding mutex across await.
`
    );

    // Mock go-reviewer SKILL.md
    const goDir = path.join(skillsDir, 'go-reviewer');
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(
      path.join(goDir, 'SKILL.md'),
      `---
name: go-reviewer
description: Go domain expert
---

# Go Reviewer Persona

## 1. Pre-Review Static Analysis Commands
\`\`\`bash
golangci-lint run ./...
go test -race ./...
\`\`\`

## 2. Quorum Review Rubrics (4 Universal Domains)

### 2.1 Security Rubric
- **SQL & Command Injection Prevention**:
  - Parameterize all SQL queries.

### 2.2 Correctness Rubric
- **Goroutine Leaks & Lifecycle Invariants**:
  - Every goroutine spawned must have a deterministic termination path.
- **The "Typed Nil" Interface Trap**:
  - Return untyped nil explicitly.

### 2.3 Adversarial & Boundary Testing Rubric
- **Channel Synchronization & Deadlock Hunting**:
  - Verify select statements handle ctx.Done().
- **Data Races & Memory Visibility**:
  - Inspect shared variables accessed across goroutines.

### 2.4 Regression & Performance Rubric
- **Table-Driven Test Architecture**:
  - Use t.Parallel() and pin loop variables.

## 3. Idiomatic Patterns vs. Anti-Patterns
### ❌ Anti-Pattern
Leaking goroutine.
`
    );

    // Mock ui-layout-reviewer SKILL.md
    const uiDir = path.join(skillsDir, 'ui-layout-reviewer');
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(
      path.join(uiDir, 'SKILL.md'),
      `---
name: ui-layout-reviewer
description: UI layout reviewer
---

# UI Layout Reviewer Persona

## 1. Pre-Review Static Analysis Commands
\`\`\`bash
npm run test:e2e
\`\`\`

## 2. Quorum Review Rubrics (4 Universal Domains)

### 2.1 Security & Access Control Rubric
- **DOM & Canvas Injection Prevention**:
  - Verify no unescaped HTML/JavaScript.

### 2.2 Correctness & Design Contract Rubric
- **Design OS 4-Tier Semantic Token Contract Compliance**:
  - Zero untokenized style literals.
- **UI Layer Hit-Testing & Pointer Event Propagation**:
  - Explicit pointer-events: none / auto and allowsHitTesting(true).

### 2.3 Adversarial & Accessibility (a11y) Rubric
- **WCAG 2.1 AA Contrast Ratios**:
  - Normal text must maintain 4.5:1 contrast.
- **Touch Target Sizing & Spacing**:
  - Minimum 48x48dp / 48x48px touch targets.

### 2.4 Regression & Responsive Layout Rubric
- **Viewport Breakpoint Robustness**:
  - Responsive across mobile, tablet, desktop.

## 3. Idiomatic Patterns vs. Anti-Patterns
### ❌ Anti-Pattern
Hardcoded hex colors.
`
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('spliceContext', () => {
    it('splices Rust persona into Security reviewer prompt', () => {
      const spliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'rust',
        role: 'security-reviewer',
        projectRoot: tempDir
      });

      expect(spliced).toContain('rust-reviewer');
      expect(spliced).toContain('Unsafe Block Audit');
      expect(spliced).toContain('// SAFETY:');
      // Should not contain unrelated correctness section
      expect(spliced).not.toContain('Async Cancellation Safety');
    });

    it('splices Rust persona into Correctness reviewer prompt', () => {
      const spliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'rust',
        role: 'correctness-reviewer',
        projectRoot: tempDir
      });

      expect(spliced).toContain('rust-reviewer');
      expect(spliced).toContain('Async Cancellation Safety');
      expect(spliced).toContain('Cross-Await Lock Contention');
      // Should not contain security section
      expect(spliced).not.toContain('Unsafe Block Audit');
    });

    it('splices Go persona into Correctness and Adversarial reviewer prompts', () => {
      const correctnessSpliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'go',
        role: 'correctness-reviewer',
        projectRoot: tempDir
      });
      expect(correctnessSpliced).toContain('go-reviewer');
      expect(correctnessSpliced).toContain('Goroutine Leaks & Lifecycle Invariants');
      expect(correctnessSpliced).toContain('Typed Nil');

      const adversarialSpliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'go',
        role: 'adversarial-reviewer',
        projectRoot: tempDir
      });
      expect(adversarialSpliced).toContain('go-reviewer');
      expect(adversarialSpliced).toContain('Channel Synchronization & Deadlock Hunting');
      expect(adversarialSpliced).toContain('Data Races & Memory Visibility');
    });

    it('splices UI Layout persona when UI files are modified', () => {
      const spliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'ui-layout',
        role: 'correctness-reviewer',
        projectRoot: tempDir
      });

      expect(spliced).toContain('ui-layout-reviewer');
      expect(spliced).toContain('Design OS 4-Tier Semantic Token Contract');
      expect(spliced).toContain('UI Layer Hit-Testing');
      expect(spliced).toContain('pointer-events');
    });

    it('combines multiple personas for full-stack polyglot projects (e.g. Rust backend + React UI)', () => {
      const spliced = DynamicQuorumContextSplicer.spliceContext({
        personas: ['rust', 'ui-layout'],
        role: 'correctness-reviewer',
        projectRoot: tempDir
      });

      expect(spliced).toContain('rust-reviewer');
      expect(spliced).toContain('Async Cancellation Safety');
      expect(spliced).toContain('ui-layout-reviewer');
      expect(spliced).toContain('UI Layer Hit-Testing');
    });

    it('handles fallback behavior gracefully when persona skill file is missing', () => {
      const spliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'generic',
        role: 'security-reviewer',
        projectRoot: tempDir
      });

      expect(spliced).toBeDefined();
      expect(typeof spliced).toBe('string');
      // Should not throw error
    });

    it('respects token budget and formats section headers cleanly', () => {
      const fullSpliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'rust',
        role: 'security-reviewer',
        projectRoot: tempDir
      });

      const constrainedSpliced = DynamicQuorumContextSplicer.spliceContext({
        persona: 'rust',
        role: 'security-reviewer',
        projectRoot: tempDir,
        maxTokens: 10 // very small token limit
      });

      expect(constrainedSpliced.length).toBeLessThan(fullSpliced.length);
      expect(constrainedSpliced).toContain('truncated');
    });

    it('interpolates into basePrompt if basePrompt is provided', () => {
      const basePrompt = '# System Prompt\nReview the following changes.\n\n{{SPLICED_PERSONA_CONTEXT}}';
      const prompt = DynamicQuorumContextSplicer.spliceContext({
        persona: 'rust',
        role: 'security-reviewer',
        projectRoot: tempDir,
        basePrompt
      });

      expect(prompt).toContain('# System Prompt');
      expect(prompt).toContain('Review the following changes.');
      expect(prompt).toContain('rust-reviewer');
      expect(prompt).not.toContain('{{SPLICED_PERSONA_CONTEXT}}');
    });
  });

  describe('buildQuorumReviewerPrompts', () => {
    it('builds prompts for all 4 quorum reviewer roles with spliced domain rubrics', () => {
      const prompts = DynamicQuorumContextSplicer.buildQuorumReviewerPrompts({
        personas: ['rust', 'ui-layout'],
        projectRoot: tempDir
      });

      const roles: ReviewerRole[] = [
        'security-reviewer',
        'correctness-reviewer',
        'adversarial-reviewer',
        'regression-reviewer'
      ];

      for (const role of roles) {
        expect(prompts[role]).toBeDefined();
        expect(typeof prompts[role]).toBe('string');
        expect(prompts[role]).toContain('rust-reviewer');
        expect(prompts[role]).toContain('ui-layout-reviewer');
      }

      // Check specific domain rubrics in their corresponding roles
      expect(prompts['security-reviewer']).toContain('Unsafe Block Audit');
      expect(prompts['correctness-reviewer']).toContain('Async Cancellation Safety');
      expect(prompts['adversarial-reviewer']).toContain('Resource Exhaustion');
      expect(prompts['regression-reviewer']).toContain('Zero-Cost Abstractions');
    });

    it('automatically resolves personas from changedFiles if personas not explicitly passed', () => {
      const prompts = DynamicQuorumContextSplicer.buildQuorumReviewerPrompts({
        changedFiles: ['pkg/server/handler.go'],
        projectRoot: tempDir
      });

      expect(prompts['correctness-reviewer']).toContain('go-reviewer');
      expect(prompts['correctness-reviewer']).toContain('Goroutine Leaks');
    });
  });
});
