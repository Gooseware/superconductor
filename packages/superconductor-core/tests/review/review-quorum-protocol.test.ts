import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Review Quorum Protocol & Subagent Dispatch Hardening', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const standaloneReviewSkill = path.join(repoRoot, 'skills/standalone-review/SKILL.md');
  const reviewSkill = path.join(repoRoot, 'skills/review/SKILL.md');
  const implementSkill = path.join(repoRoot, 'skills/implement/SKILL.md');
  const installHooksScript = path.join(repoRoot, 'scripts/hooks/install-hooks.sh');
  const installGitHookScript = path.join(repoRoot, 'scripts/install-git-hook.sh');

  describe('In-Process Evaluation & Simulation Prohibition', () => {
    it('skills/standalone-review/SKILL.md strictly rejects in-process simulation and parallel role execution language', () => {
      expect(fs.existsSync(standaloneReviewSkill)).toBe(true);
      const content = fs.readFileSync(standaloneReviewSkill, 'utf-8');

      // The permissive loophole phrase MUST NOT exist
      expect(content).not.toContain('or execute their roles directly in parallel');
      expect(content).not.toContain('execute their roles directly');

      // Mandatory prohibition language must be present
      expect(content).toContain('STRICTLY PROHIBITED');
      expect(content).toMatch(/evaluating,?\s*simulating,?\s*or\s*writing\s*reviewer\s*verdicts\s*in-process/i);
    });

    it('skills/review/SKILL.md strictly rejects in-process simulation language', () => {
      expect(fs.existsSync(reviewSkill)).toBe(true);
      const content = fs.readFileSync(reviewSkill, 'utf-8');

      expect(content).not.toContain('or execute their roles directly in parallel');
      expect(content).not.toContain('execute their roles directly');
      expect(content).toContain('STRICTLY PROHIBITED');
    });
  });

  describe('Strict 4-Reviewer Panel & invoke_subagent Invariant', () => {
    const requiredRoles = [
      'security-reviewer',
      'correctness-reviewer',
      'adversarial-reviewer',
      'regression-reviewer'
    ];

    it('skills/standalone-review/SKILL.md requires invoke_subagent for all 4 review roles', () => {
      const content = fs.readFileSync(standaloneReviewSkill, 'utf-8');
      expect(content).toContain('invoke_subagent');

      for (const role of requiredRoles) {
        expect(content.toLowerCase()).toContain(role.toLowerCase());
      }

      expect(content).toMatch(/NEVER\s+conclude\s+a\s+quorum\s+review\s+until\s+all\s+4\s+subagents/i);
    });

    it('skills/review/SKILL.md enforces the 4-subagent Quorum panel via invoke_subagent', () => {
      const content = fs.readFileSync(reviewSkill, 'utf-8');
      expect(content).toContain('invoke_subagent');

      for (const role of requiredRoles) {
        expect(content.toLowerCase()).toContain(role.toLowerCase());
      }
    });
  });

  describe('Structured JSON Output Extraction Block Schema', () => {
    it('skills/standalone-review/SKILL.md defines json:review-findings markdown block schema', () => {
      const content = fs.readFileSync(standaloneReviewSkill, 'utf-8');
      expect(content).toContain('```json:review-findings');
      expect(content).toContain('"severity"');
      expect(content).toContain('"domain"');
      expect(content).toContain('"file"');
      expect(content).toContain('"line"');
      expect(content).toContain('"description"');
    });

    it('skills/review/SKILL.md defines json:review-findings markdown block schema', () => {
      const content = fs.readFileSync(reviewSkill, 'utf-8');
      expect(content).toContain('```json:review-findings');
      expect(content).toContain('"severity"');
      expect(content).toContain('"domain"');
      expect(content).toContain('"file"');
      expect(content).toContain('"line"');
      expect(content).toContain('"description"');
    });
  });

  describe('Dynamic Script Path Resolution ($SUPERCONDUCTOR_DIR)', () => {
    it('skills/standalone-review/SKILL.md resolves scripts dynamically using $SUPERCONDUCTOR_DIR', () => {
      const content = fs.readFileSync(standaloneReviewSkill, 'utf-8');
      expect(content).toContain('${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/');
      // Bare scripts/ execution should not be present in shell code blocks
      expect(content).not.toMatch(/npx\s+-y\s+tsx\s+scripts\//);
    });

    it('skills/review/SKILL.md resolves scripts dynamically using $SUPERCONDUCTOR_DIR', () => {
      const content = fs.readFileSync(reviewSkill, 'utf-8');
      expect(content).toContain('${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}/scripts/');
    });

    it('skills/implement/SKILL.md resolves script paths via $SUPERCONDUCTOR_DIR', () => {
      const content = fs.readFileSync(implementSkill, 'utf-8');
      expect(content).toContain('${SUPERCONDUCTOR_DIR:-$HOME/.gemini/config/plugins/superconductor}');
    });

    it('scripts/hooks/install-hooks.sh dynamically resolves source hook from $SUPERCONDUCTOR_DIR', () => {
      const content = fs.readFileSync(installHooksScript, 'utf-8');
      expect(content).toContain('SUPERCONDUCTOR_DIR');
    });

    it('scripts/install-git-hook.sh dynamically resolves cli-update.js from $SUPERCONDUCTOR_DIR', () => {
      const content = fs.readFileSync(installGitHookScript, 'utf-8');
      expect(content).toContain('SUPERCONDUCTOR_DIR');
    });
  });

  describe('Quorum Preflight Test Execution & Context Injection Protocol', () => {
    const swarmExecuteSkill = path.join(repoRoot, 'skills/swarm-execute/SKILL.md');
    const workflowDoc = path.join(repoRoot, 'superconductor/workflow.md');

    it('skills/standalone-review/SKILL.md documents Quorum Preflight Test Execution & Context Injection Protocol', () => {
      const content = fs.readFileSync(standaloneReviewSkill, 'utf-8');
      expect(content).toContain('Quorum Preflight Test Execution & Context Injection Protocol');
      expect(content).toContain('QuorumPreflightTestRunner');
      expect(content).toContain('## Preflight Test Execution Evidence');
    });

    it('skills/review/SKILL.md documents Quorum Preflight Test Execution & Context Injection Protocol', () => {
      const content = fs.readFileSync(reviewSkill, 'utf-8');
      expect(content).toContain('Quorum Preflight Test Execution & Context Injection Protocol');
      expect(content).toContain('QuorumPreflightTestRunner');
      expect(content).toContain('## Preflight Test Execution Evidence');
    });

    it('skills/swarm-execute/SKILL.md documents Quorum Preflight Test Execution & Context Injection Protocol', () => {
      expect(fs.existsSync(swarmExecuteSkill)).toBe(true);
      const content = fs.readFileSync(swarmExecuteSkill, 'utf-8');
      expect(content).toContain('Quorum Preflight Test Execution & Context Injection Protocol');
      expect(content).toContain('QuorumPreflightTestRunner');
      expect(content).toContain('## Preflight Test Execution Evidence');
    });

    it('superconductor/workflow.md documents Quorum Preflight Test Execution & Context Injection Protocol', () => {
      expect(fs.existsSync(workflowDoc)).toBe(true);
      const content = fs.readFileSync(workflowDoc, 'utf-8');
      expect(content).toContain('Quorum Preflight Test Execution & Context Injection Protocol');
      expect(content).toContain('QuorumPreflightTestRunner');
      expect(content).toContain('## Preflight Test Execution Evidence');
    });
  });
});

