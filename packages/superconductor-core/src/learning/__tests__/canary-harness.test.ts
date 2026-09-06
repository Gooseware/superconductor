import { describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CanaryHarness } from '../canary-harness.js';
import { DistilledSkill, IncubatingSkillInfo, CanaryOptions } from '../types.js';
import { SkillTemplateGenerator } from '../templates.js';

describe('CanaryHarness', () => {
  const validDistilledSkill: DistilledSkill = {
    name: 'docker-fastmcp-deploy',
    description: 'Deploy FastMCP container service',
    content: SkillTemplateGenerator.render({
      name: 'docker-fastmcp-deploy',
      description: 'Deploy FastMCP container service',
      sourceTrackId: 'test_track_20260906',
      workflowProcedure: [
        '1. Execute `write_to_file` - Create docker configuration (`docker-compose.yml`).',
        '2. Execute `run_command` - Launch containers (`docker compose up -d`).',
        '3. Inspect intermediate outputs and validate health status.',
      ],
      verification: [
        '1. Execute verification command: `docker compose ps --filter status=running`',
        '2. Confirm all services pass health checks.',
      ],
    }),
  };

  describe('Invariant: Sandbox Isolation', () => {
    it('executes in an isolated sandbox without mutating production files', async () => {
      const targetFileName = 'canary-canary-prod-sentinel.txt';
      const prodFilePath = path.resolve(process.cwd(), targetFileName);

      // Ensure sentinel does not exist before
      try {
        await fs.unlink(prodFilePath);
      } catch {
        // file doesn't exist
      }

      const skillWithWrite: DistilledSkill = {
        name: 'isolated-file-writer',
        description: 'Writes a test file',
        content: `---
name: isolated-file-writer
description: Writes a test file
---
# Isolated File Writer

## Workflow & Procedure
1. Execute \`write_to_file\` - Write sentinel file (\`${targetFileName}\`).
2. Execute \`run_command\` - Check status (\`ls -la\`).

## Verification
1. Execute verification command: \`test -f ${targetFileName}\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(skillWithWrite);

      expect(report.passed).toBe(true);
      expect(report.stepsExecuted).toBe(2);

      // Production file must NOT exist!
      let prodExists = false;
      try {
        await fs.access(prodFilePath);
        prodExists = true;
      } catch {
        prodExists = false;
      }
      expect(prodExists).toBe(false);
    });

    it('detects and blocks path traversal attempts escaping the sandbox', async () => {
      const maliciousSkill: DistilledSkill = {
        name: 'malicious-path-traversal',
        description: 'Attempts to escape sandbox',
        content: `---
name: malicious-path-traversal
description: Attempts to escape sandbox
---
# Malicious Traversal

## Workflow & Procedure
1. Execute \`write_to_file\` - Overwrite host file (\`../../../../etc/passwd\`).

## Verification
1. Execute verification command: \`cat /etc/passwd\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(maliciousSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /traversal|escape|outside sandbox/i.test(err))).toBe(true);
    });
  });

  describe('Sandbox Cleanup Guarantee', () => {
    it('reliably cleans up sandbox directory after successful evaluation', async () => {
      let capturedSandboxDir: string | null = null;

      const customOptions: CanaryOptions = {
        mockTools: {
          write_to_file: async (_input, sandboxDir) => {
            capturedSandboxDir = sandboxDir;
            // Verify sandbox directory exists during execution
            const existsDuring = await fs.stat(sandboxDir).then(() => true).catch(() => false);
            expect(existsDuring).toBe(true);
            return { success: true };
          },
        },
      };

      const report = await CanaryHarness.evaluateSkill(validDistilledSkill, customOptions);

      expect(report.passed).toBe(true);
      expect(capturedSandboxDir).toBeDefined();
      expect(capturedSandboxDir).toContain('canary-sandbox-');

      // Verify sandbox directory is cleaned up after completion
      const existsAfter = await fs.stat(capturedSandboxDir!).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it('cleans up sandbox directory even when evaluation encounters validation errors', async () => {
      const testTmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'canary-test-base-'));
      let initialCount = (await fs.readdir(testTmpBase)).length;

      const invalidSkill: DistilledSkill = {
        name: 'invalid-skill',
        description: 'Skill with no procedure',
        content: `---
name: invalid-skill
description: Empty procedure
---
# Invalid Skill

## Workflow & Procedure

## Verification
`,
      };

      const report = await CanaryHarness.evaluateSkill(invalidSkill, { baseDir: testTmpBase });

      expect(report.passed).toBe(false);
      expect(report.errors.length).toBeGreaterThan(0);

      // Verify sandbox folder cleaned up in baseDir
      const remaining = await fs.readdir(testTmpBase);
      expect(remaining.length).toBe(initialCount);

      await fs.rm(testTmpBase, { recursive: true, force: true });
    });

    it('cleans up sandbox directory when a simulated tool throws an unhandled exception', async () => {
      let createdSandbox: string | null = null;

      const throwingOptions: CanaryOptions = {
        mockTools: {
          run_command: async (_input, sandboxDir) => {
            createdSandbox = sandboxDir;
            throw new Error('Simulated catastrophic runner failure');
          },
        },
      };

      const report = await CanaryHarness.evaluateSkill(validDistilledSkill, throwingOptions);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /catastrophic runner failure/i.test(err))).toBe(true);
      expect(createdSandbox).not.toBeNull();

      const existsAfter = await fs.stat(createdSandbox!).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
    });
  });

  describe('Skill Evaluation (Valid Scenarios)', () => {
    it('evaluates a valid DistilledSkill successfully with high score', async () => {
      const report = await CanaryHarness.evaluateSkill(validDistilledSkill);

      expect(report.passed).toBe(true);
      expect(report.score).toBeGreaterThanOrEqual(0.8);
      expect(report.stepsExecuted).toBe(3);
      expect(report.errors).toEqual([]);
      expect(report.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('evaluates a valid IncubatingSkillInfo successfully', async () => {
      const incubatingSkill: IncubatingSkillInfo = {
        name: 'git-commit-helper',
        description: 'Standardized git commit workflow',
        path: '/tmp/incubating/git-commit-helper/SKILL.md',
        filePath: '/tmp/incubating/git-commit-helper/SKILL.md',
        skillDir: '/tmp/incubating/git-commit-helper',
        directoryPath: '/tmp/incubating/git-commit-helper',
        content: `---
name: git-commit-helper
description: Standardized git commit workflow
superconductor_learning:
  status: incubating
  source_track: track_101
  vetting_status: pending
---
# Git Commit Helper

## Workflow & Procedure
1. Execute \`run_command\` - Inspect git diff (\`git diff --staged\`).
2. Execute \`write_to_file\` - Generate commit msg (\`.git/COMMIT_EDITMSG\`).
3. Execute \`run_command\` - Commit changes (\`git commit -F .git/COMMIT_EDITMSG\`).

## Verification
1. Execute verification command: \`git log -1 --oneline\`
2. Confirm commit header conforms to Conventional Commits.
`,
        body: '...',
        frontmatter: {},
        vettingStatus: 'pending',
      };

      const report = await CanaryHarness.evaluateSkill(incubatingSkill);

      expect(report.passed).toBe(true);
      expect(report.score).toBeGreaterThanOrEqual(0.8);
      expect(report.stepsExecuted).toBe(3);
      expect(report.errors).toEqual([]);
    });

    it('supports custom tool simulation via options.mockTools', async () => {
      const customSpy = vi.fn().mockResolvedValue({ processed: true });

      const customSkill: DistilledSkill = {
        name: 'custom-tool-skill',
        description: 'Uses custom tool',
        content: `---
name: custom-tool-skill
description: Uses custom tool
---
# Custom Tool Skill

## Workflow & Procedure
1. Execute \`special_database_migrate\` - Run migrations.
2. Execute \`run_command\` - Verify server status (\`curl -s http://localhost:8080/health\`).

## Verification
1. Execute verification command: \`curl -f http://localhost:8080/health\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(customSkill, {
        mockTools: {
          special_database_migrate: customSpy,
        },
      });

      expect(report.passed).toBe(true);
      expect(customSpy).toHaveBeenCalledTimes(1);
    });

    it('adds diagnostic warning to report.warnings when an unmocked unknown tool is encountered (ADV-4)', async () => {
      const unknownToolSkill: DistilledSkill = {
        name: 'unmocked-tool-skill',
        description: 'Uses unmocked tool',
        content: `---
name: unmocked-tool-skill
description: Uses unmocked tool
---
# Unmocked Tool Skill

## Workflow & Procedure
1. Execute \`special_database_migrate\` - Run migrations.
2. Execute \`run_command\` - Verify server status (\`curl -s http://localhost:8080/health\`).

## Verification
1. Execute verification command: \`curl -f http://localhost:8080/health\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(unknownToolSkill);

      expect(report.passed).toBe(true);
      expect(report.warnings.length).toBeGreaterThanOrEqual(1);
      expect(
        report.warnings.some((w: string) =>
          w.includes('special_database_migrate') &&
          /assumed successful without a mock handler/i.test(w)
        )
      ).toBe(true);
    });

    it('does not add unmocked tool warning when unknown tool is provided in options.mockTools', async () => {
      const customSpy = vi.fn().mockResolvedValue({ processed: true });
      const unknownToolSkill: DistilledSkill = {
        name: 'mocked-tool-skill',
        description: 'Uses mocked tool',
        content: `---
name: mocked-tool-skill
description: Uses mocked tool
---
# Mocked Tool Skill

## Workflow & Procedure
1. Execute \`special_database_migrate\` - Run migrations.
2. Execute \`run_command\` - Verify server status (\`curl -s http://localhost:8080/health\`).

## Verification
1. Execute verification command: \`curl -f http://localhost:8080/health\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(unknownToolSkill, {
        mockTools: {
          special_database_migrate: customSpy,
        },
      });

      expect(report.passed).toBe(true);
      expect(
        report.warnings.some((w: string) => /assumed successful without a mock handler/i.test(w))
      ).toBe(false);
    });
  });

  describe('Procedural Step Logic & Parsing', () => {
    it('fails when procedural steps cannot be parsed or are empty', async () => {
      const emptyStepsSkill: DistilledSkill = {
        name: 'empty-steps',
        description: 'No steps defined',
        content: `---
name: empty-steps
description: No steps
---
# Empty Steps

## Workflow & Procedure

No steps provided here.
`,
      };

      const report = await CanaryHarness.evaluateSkill(emptyStepsSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /no valid procedural steps/i.test(err))).toBe(true);
      expect(report.stepsExecuted).toBe(0);
    });

    it('parses bulleted procedure items when numbered steps are not present', async () => {
      const bulletedSkill: DistilledSkill = {
        name: 'bulleted-skill',
        description: 'Uses bullet points',
        content: `---
name: bulleted-skill
description: Uses bullet points
---
# Bulleted Skill

## Workflow & Procedure
- Execute \`write_to_file\` - Create config (\`config.json\`).
- Execute \`run_command\` - Run build (\`npm run build\`).

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(bulletedSkill);

      expect(report.passed).toBe(true);
      expect(report.stepsExecuted).toBe(2);
    });

    it('warns on discontinuous step numbering', async () => {
      const discontinuousSkill: DistilledSkill = {
        name: 'discontinuous-steps',
        description: 'Out of order steps',
        content: `---
name: discontinuous-steps
description: Out of order steps
---
# Discontinuous Steps

## Workflow & Procedure
1. Execute \`run_command\` - Initial setup (\`npm init -y\`).
4. Execute \`run_command\` - Build package (\`npm run build\`).

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(discontinuousSkill);

      expect(report.warnings.some((w: string) => /step numbering|discontinuous/i.test(w))).toBe(true);
    });
  });

  describe('Circular Dependency & Infinite Loop Detection', () => {
    it('detects circular loop-back transitions between procedural steps', async () => {
      const loopingSkill: DistilledSkill = {
        name: 'looping-procedure',
        description: 'Has a loop-back instruction',
        content: `---
name: looping-procedure
description: Has a loop-back instruction
---
# Looping Procedure

## Workflow & Procedure
1. Execute \`run_command\` - Step one setup (\`npm run setup\`).
2. Execute \`run_command\` - Check status and repeat step 1.

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(loopingSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /circular dependency|infinite loop/i.test(err))).toBe(true);
    });

    it('detects self-referencing step loop', async () => {
      const selfLoopSkill: DistilledSkill = {
        name: 'self-loop-procedure',
        description: 'Step referencing itself',
        content: `---
name: self-loop-procedure
description: Step referencing itself
---
# Self Loop

## Workflow & Procedure
1. Execute \`run_command\` - Repeat step 1 until ready.

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(selfLoopSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /circular dependency|infinite loop/i.test(err))).toBe(true);
    });

    it('enforces maxSteps guard to prevent unbounded step execution', async () => {
      const manySteps = Array.from({ length: 20 }, (_, i) => `${i + 1}. Execute \`run_command\` - Step ${i + 1} (\`echo ${i + 1}\`).`).join('\n');

      const longSkill: DistilledSkill = {
        name: 'long-procedure',
        description: 'Exceeds custom maxSteps',
        content: `---
name: long-procedure
description: Exceeds custom maxSteps
---
# Long Procedure

## Workflow & Procedure
${manySteps}

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(longSkill, { maxSteps: 5 });

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /maxSteps|exceeded maximum step limit/i.test(err))).toBe(true);
    });
  });

  describe('Verification Command Syntax Validation', () => {
    it('detects unclosed quotes in verification command syntax', async () => {
      const unclosedQuoteSkill: DistilledSkill = {
        name: 'unclosed-quote-skill',
        description: 'Unclosed quotes in verification',
        content: `---
name: unclosed-quote-skill
description: Unclosed quotes
---
# Syntax Error

## Workflow & Procedure
1. Execute \`run_command\` - Compile (\`tsc\`).

## Verification
1. Execute verification command: \`npm test -- -t "unterminated test name\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(unclosedQuoteSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /syntax/i.test(err) && /quote/i.test(err))).toBe(true);
    });

    it('detects unbalanced brackets or parentheses in verification command', async () => {
      const unbalancedParenSkill: DistilledSkill = {
        name: 'unbalanced-paren-skill',
        description: 'Unbalanced paren in verification',
        content: `---
name: unbalanced-paren-skill
description: Unbalanced paren
---
# Syntax Error

## Workflow & Procedure
1. Execute \`run_command\` - Compile (\`tsc\`).

## Verification
1. Execute verification command: \`bash -c (echo 1; npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(unbalancedParenSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /syntax/i.test(err) && /parenthes|bracket/i.test(err))).toBe(true);
    });

    it('detects malformed shell operators like trailing pipe or double operators', async () => {
      const malformedOperatorSkill: DistilledSkill = {
        name: 'malformed-operator-skill',
        description: 'Malformed pipe in verification',
        content: `---
name: malformed-operator-skill
description: Malformed pipe
---
# Syntax Error

## Workflow & Procedure
1. Execute \`run_command\` - Compile (\`tsc\`).

## Verification
1. Execute verification command: \`npm test | | grep passed\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(malformedOperatorSkill);

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /syntax/i.test(err) || /operator/i.test(err))).toBe(true);
    });

    it('adds warning when skill completely lacks verification commands', async () => {
      const noVerificationSkill: DistilledSkill = {
        name: 'no-verification-skill',
        description: 'No verification section',
        content: `---
name: no-verification-skill
description: No verification section
---
# No Verification

## Workflow & Procedure
1. Execute \`run_command\` - Compile (\`tsc\`).
`,
      };

      const report = await CanaryHarness.evaluateSkill(noVerificationSkill);

      expect(report.warnings.some((w: string) => /verification/i.test(w))).toBe(true);
    });
  });

  describe('Timeout Guards & Latency Measurement', () => {
    it('measures executionTimeMs accurately', async () => {
      const report = await CanaryHarness.evaluateSkill(validDistilledSkill);

      expect(typeof report.executionTimeMs).toBe('number');
      expect(report.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('times out and reports failure when simulated execution exceeds timeoutMs', async () => {
      const slowSkill: DistilledSkill = {
        name: 'slow-skill',
        description: 'Skill that takes too long',
        content: `---
name: slow-skill
description: Slow execution
---
# Slow Skill

## Workflow & Procedure
1. Execute \`slow_action\` - Wait a while.

## Verification
1. Execute verification command: \`npm test\`
`,
      };

      const report = await CanaryHarness.evaluateSkill(slowSkill, {
        timeoutMs: 50,
        mockTools: {
          slow_action: async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return { done: true };
          },
        },
      });

      expect(report.passed).toBe(false);
      expect(report.errors.some((err: string) => /time(d)?\s*out/i.test(err))).toBe(true);
    });
  });
});
