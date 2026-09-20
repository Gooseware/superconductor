import { describe, it, expect } from 'vitest';
import { UxRuleEngine, UxReviewInput, UxReviewReport, Finding } from './ux-rule-engine.js';
import { ALL_UX_RULES } from './rules/index.js';
import { runUxCli } from './ux-rule-engine-cli.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('UxRuleEngine', () => {
  it('has exactly 56 rules registered across 8 groups', () => {
    expect(ALL_UX_RULES).toHaveLength(56);
    const groups = new Set(ALL_UX_RULES.map(r => r.ruleGroup));
    expect(groups.size).toBe(8);

    // Verify each prefix has 7 rules
    const prefixes = ['UX-OUT', 'UX-TRM', 'UX-INS', 'UX-VIS', 'UX-COG', 'UX-SCH', 'UX-EMJ', 'UX-SMP'];
    for (const prefix of prefixes) {
      const groupRules = ALL_UX_RULES.filter(r => r.id.startsWith(prefix));
      expect(groupRules).toHaveLength(7);
    }
  });

  describe('Compliant Content (PASS)', () => {
    it('returns PASS with zero findings and complete coverage manifest on compliant content', () => {
      const compliantContent = `
# System Architecture

The orchestrator MUST dispatch tasks to the active worker.
To exit the process, press Q.

## Execution Steps

1. Configure the runtime environment.
2. Initialize the project workspace.
3. Run the verification suite.

\`\`\`typescript
const worker = new Worker();
worker.start();
\`\`\`

✅ Intelligence baseline established for \`/repo/project\` (SHA: \`abc1234\`).
`;

      const report = UxRuleEngine.evaluate({
        content: compliantContent,
        targetType: 'skill_instruction',
        mode: 'quorum'
      });

      expect(report.verdict).toBe('PASS');
      expect(report.findings).toHaveLength(0);
      expect(report.coverage_manifest).toHaveLength(56);
      expect(report.summary.totalRulesChecked).toBe(56);
      expect(report.summary.passedRules).toBe(56);
      expect(report.summary.failedRules).toBe(0);
    });
  });

  describe('Group 1: Output Message Quality (UX-OUT)', () => {
    it('detects raw stack traces (UX-OUT-05) -> NEEDS_FIXES', () => {
      const content = `
An error occurred during build:
TypeError: Cannot read property 'map' of undefined
    at Object.evaluate (/home/user/app/src/index.ts:42:15)
    at Module.run (/home/user/app/src/runner.ts:10:5)
Run: npx vitest to reproduce.
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'cli_output' });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-OUT-05');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
      expect(finding?.description).toContain('Raw stack trace detected');
    });

    it('detects error message without actionable remediation (UX-OUT-06) -> NEEDS_FIXES', () => {
      const content = `
❌ Failed to connect to database host at 127.0.0.1:5432. Connection timeout.
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'cli_output' });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-OUT-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.remediation).toContain('remediation step');
    });

    it('passes error message when actionable remediation is provided', () => {
      const content = `
❌ Failed to connect to database.
Run: systemctl start postgresql to fix.
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'cli_output' });
      const finding = report.findings.find(f => f.id === 'UX-OUT-06');
      expect(finding).toBeUndefined();
    });

    it('detects naked print statements (UX-OUT-01)', () => {
      const content = `
function logSomething() {
  console.log("Hello world");
}
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'code_comments' });
      const finding = report.findings.find(f => f.id === 'UX-OUT-01');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects terminal line length exceeding 80 characters in cli_output (UX-OUT-02)', () => {
      const content = 'This is an extremely long terminal log line that clearly exceeds the standard eighty characters limit for standard terminals.';
      const report = UxRuleEngine.evaluate({ content, targetType: 'cli_output' });
      const finding = report.findings.find(f => f.id === 'UX-OUT-02');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects trailing whitespace (UX-OUT-04)', () => {
      const content = 'const x = 1;   \nconst y = 2;\n';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-OUT-04');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('ADVISORY');
    });
  });

  describe('Group 2: Terminology & Naming Consistency (UX-TRM)', () => {
    it('detects banned synonym "ticket" -> track (UX-TRM-06) -> NEEDS_FIXES', () => {
      const content = 'Please close the ticket once testing is complete.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-TRM-06' && f.description.includes('ticket'));
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('track');
    });

    it('detects banned synonym "task card" -> track (UX-TRM-06) -> NEEDS_FIXES', () => {
      const content = 'The user created a task card for the bug.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-TRM-06' && f.description.includes('task card'));
      expect(finding).toBeDefined();
    });

    it('detects banned synonym "dev work" -> implementation (UX-TRM-06)', () => {
      const content = 'Start the dev work after the plan is reviewed.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-TRM-06' && f.description.includes('dev work'));
      expect(finding).toBeDefined();
    });

    it('detects brand capitalization errors (Typescript, Github, Nodejs) (UX-TRM-06) -> NEEDS_FIXES', () => {
      const content = 'Built with Typescript, hosted on Github, powered by Nodejs.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const findings = report.findings.filter(f => f.id === 'UX-TRM-06');
      expect(findings.length).toBeGreaterThanOrEqual(3);
    });

    it('detects malformed status line deviating from UX-2 (UX-TRM-01)', () => {
      const content = '⏳ Bootstrapping the whole system now...';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-TRM-01');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects unsafe prompt default [Y/n] on destructive commands (UX-TRM-05)', () => {
      const content = 'Are you sure you want to delete all records? [Y/n]';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-TRM-05');
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('[y/N]');
    });

    it('skips terminology definition table rows documenting prohibited words (UX-TRM-06)', () => {
      const content = `
| Canonical Term | Prohibited Synonyms |
| :--- | :--- |
| track | ticket, issue, task card, story |
| spec | requirement document, design doc |
| implementation | coding, dev work |
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'skill_instruction' });
      const trm06Findings = report.findings.filter(f => f.id === 'UX-TRM-06');
      expect(trm06Findings).toHaveLength(0);
    });
  });

  describe('Group 3: Instruction Clarity & Atomicity (UX-INS)', () => {
    it('detects passive voice (UX-INS-01) -> NEEDS_FIXES', () => {
      const content = 'The branch was created by the developer.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-INS-01');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
      expect(finding?.description).toContain('Passive voice');
    });

    it('detects lowercase RFC 2119 keyword in instructions (UX-INS-03) -> NEEDS_FIXES', () => {
      const content = 'The orchestrator must verify that all reviewers have signed off.';
      const report = UxRuleEngine.evaluate({ content, targetType: 'skill_instruction' });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-INS-03');
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('MUST');
    });

    it('detects polite filler words like "Please" (UX-INS-04)', () => {
      const content = '- Please run npm test before committing.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-INS-04');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('ADVISORY');
    });

    it('detects user-blaming language (UX-INS-05) -> NEEDS_FIXES', () => {
      const content = 'Error: you failed to provide the required arguments.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-INS-05');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects compound non-atomic steps (UX-INS-06)', () => {
      const content = '1. Run the migrations and then also deploy the schema changes.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-INS-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects unformatted commands without code blocks (UX-INS-07)', () => {
      const content = 'npm run build to generate the output files.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-INS-07');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });
  });

  describe('Group 4: Visual Hierarchy & Formatting (UX-VIS)', () => {
    it('detects fenced code block without language tag (UX-VIS-03) -> NEEDS_FIXES', () => {
      const content = `
Here is the code:
\`\`\`
const a = 10;
\`\`\`
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-VIS-03');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.description).toContain('missing a language tag');
    });

    it('detects heading level jump e.g. # to ### (UX-VIS-05) -> NEEDS_FIXES', () => {
      const content = `
# Title

### Subsection Without H2
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-VIS-05');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects banner without verified success (UX-VIS-07) -> NEEDS_FIXES', () => {
      const content = '✅ Starting environment setup now...';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-VIS-07');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
      expect(finding?.description).toContain('unverified/attempted action');
    });

    it('detects unhighlighted file paths (UX-VIS-02) -> NEEDS_FIXES', () => {
      const content = 'The output will be saved to packages/superconductor-core/src/index.ts for review.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-VIS-02');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });
  });

  describe('Group 5: Cognitive Load (UX-COG)', () => {
    it('detects wall of text exceeding 6 lines (UX-COG-01) -> NEEDS_FIXES', () => {
      const content = `
Line one of a very dense continuous block of prose text.
Line two of this dense continuous block of prose text.
Line three of this dense continuous block of prose text.
Line four of this dense continuous block of prose text.
Line five of this dense continuous block of prose text.
Line six of this dense continuous block of prose text.
Line seven of this dense continuous block of prose text.
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-COG-01');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects 3-tier directory contract confusion (UX-COG-05) -> NEEDS_FIXES', () => {
      const content = `
const outputDir = getSuperconductorHome();
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-COG-05');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.remediation).toContain('INTELLIGENCE_DIR');
    });

    it('detects summary-first reporting violation in reports (UX-COG-06) -> NEEDS_FIXES', () => {
      const content = `
## Detailed Analysis of Module

Some very long explanation of findings...

## Findings

### High Finding
Something was wrong.

Verdict: NEEDS_FIXES
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-COG-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects raw byte numbers without human-readable units (UX-COG-07)', () => {
      const content = 'File size is 1258291 bytes on disk.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-COG-07');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });
  });

  describe('Group 6: Schema & API Ergonomics (UX-SCH)', () => {
    it('detects empty MCP description (UX-SCH-06) -> NEEDS_FIXES', () => {
      const content = `
const tool = {
  name: "my_tool",
  description: ""
};
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'mcp_schema' });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-SCH-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects parameters null check violation (UX-SCH-07) -> NEEDS_FIXES', () => {
      const content = `
function handleTool(request: any) {
  const query = request.params.arguments.query;
  return query;
}
`;
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-SCH-07');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects vague non-executable remediation (UX-SCH-03)', () => {
      const content = `
const finding = {
  id: "UX-01",
  remediation: "try again"
};
`;
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-SCH-03');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });
  });

  describe('Group 7: Emoji Usage (UX-EMJ)', () => {
    it('detects inverted emoji semantics (UX-EMJ-01) -> NEEDS_FIXES', () => {
      const content = '❌ The test suite succeeded with 100% pass rate.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-EMJ-01');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects multiple emojis on single line (UX-EMJ-02) -> NEEDS_FIXES', () => {
      const content = '🚀🔥 Build completed successfully!';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-EMJ-02');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects emoji in middle/end of sentence (UX-EMJ-03) -> NEEDS_FIXES', () => {
      const content = 'Starting test runner ⏳';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-EMJ-03');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects missing space after emoji (UX-EMJ-04)', () => {
      const content = '✅Starting test execution';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-EMJ-04');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('ADVISORY');
    });

    it('detects inline word replacement with emoji (UX-EMJ-05) -> NEEDS_FIXES', () => {
      const content = 'Use this 🔑 to login to your dashboard.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-EMJ-05');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });

    it('detects non-standard decorative emojis (UX-EMJ-06)', () => {
      const content = '🍕 Deployment lunch ready';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-EMJ-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('skips table rows where icons are listed in tables (UX-EMJ-03)', () => {
      const content = `
| Emoji | Semantic Meaning |
| :--- | :--- |
| ✔ | [PASS] Success |
| ⏳ | [RUN] Running tasks... |
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'skill_instruction' });
      const emj03Findings = report.findings.filter(f => f.id === 'UX-EMJ-03');
      expect(emj03Findings).toHaveLength(0);
    });
  });

  describe('Group 8: Simplification / Do More With Less (UX-SMP)', () => {
    it('detects throat-clearing phrase (UX-SMP-02) -> NEEDS_FIXES', () => {
      const content = 'In this section, we will review the system configuration.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-SMP-02');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
      expect(finding?.description).toContain('Throat-clearing');
    });

    it('detects prohibited lexicon term "review panel" -> quorum (UX-SMP-01)', () => {
      const content = 'Submit the results to the review panel for approval.';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-SMP-01');
      expect(finding).toBeDefined();
      expect(finding?.remediation).toContain('quorum');
    });

    it('skips terminology definition table rows (UX-SMP-01)', () => {
      const content = `
| Canonical Term | Prohibited Synonyms |
| :--- | :--- |
| spec | requirement document, design doc |
| implementation | coding, dev work |
| quorum | review board, panel |
`;
      const report = UxRuleEngine.evaluate({ content, targetType: 'skill_instruction' });
      const smp01Findings = report.findings.filter(f => f.id === 'UX-SMP-01');
      expect(smp01Findings).toHaveLength(0);
    });

    it('detects redundant parenthetical explanations (UX-SMP-06)', () => {
      const content = 'Call `resolveSnapshot()` (which runs the resolveSnapshot of the reader).';
      const report = UxRuleEngine.evaluate({ content });
      const finding = report.findings.find(f => f.id === 'UX-SMP-06');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('HIGH');
    });

    it('detects unrendered template placeholders (UX-SMP-07) -> NEEDS_FIXES', () => {
      const content = 'The status is {{status}} for project {{projectName}}.';
      const report = UxRuleEngine.evaluate({ content });
      expect(report.verdict).toBe('NEEDS_FIXES');
      const finding = report.findings.find(f => f.id === 'UX-SMP-07');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('CRITICAL');
    });
  });

  describe('Processor Mode Heuristics Access', () => {
    it('exposes all 56 active generative heuristics', () => {
      const heuristics = UxRuleEngine.getHeuristics();
      expect(heuristics).toHaveLength(56);
      heuristics.forEach(h => {
        expect(h.id).toMatch(/^UX-[A-Z]{3}-\d{2}$/);
        expect(h.ruleGroup).toBeTruthy();
        expect(h.heuristic).toBeTruthy();
      });
    });
  });

  describe('CLI Entrypoint (ux-rule-engine-cli)', () => {
    let tmpDir: string;

    it('returns exit code 0 on compliant file', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-cli-'));
      const testFile = path.join(tmpDir, 'compliant.md');
      fs.writeFileSync(testFile, '# Overview\n\nAll tasks MUST be verified before merge.\nTo exit, press Q.\n');

      const exitCode = await runUxCli(['--input', testFile]);
      expect(exitCode).toBe(0);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns exit code 1 on non-compliant file with critical/high findings', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-cli-'));
      const testFile = path.join(tmpDir, 'invalid.md');
      fs.writeFileSync(testFile, 'The ticket was created by user.\n');

      const exitCode = await runUxCli(['--input', testFile]);
      expect(exitCode).toBe(1);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('prints heuristics with --heuristics flag and exits 0', async () => {
      const exitCode = await runUxCli(['--heuristics']);
      expect(exitCode).toBe(0);
    });
  });
});
