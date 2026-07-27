import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { evaluatePhaseGate } from '../src/review/swarm-phase-gate';
import { runPairProgrammingLoop } from '../src/intelligence/pair-programming';
import { ABIPostMortem, ABI, ABIReport } from '../src/review/abi';
import { QualityNotesWriter } from '../src/telemetry/quality-notes';

describe('Boundary & Edge-Case Verification Suite', () => {
  describe('Focus 1: ABI edge cases', () => {
    it('handles primaryTweak null or undefined', () => {
      const report: ABIReport = {
        primaryTweak: null,
        candidateTweaks: [],
        retryCount: 0,
        criticalFindings: [],
        advisoryFindings: []
      };
      expect(() => ABI.applySkillTweak(report, '/tmp')).not.toThrow();
    });

    it('throws error when primaryTweak search or replace is empty string when file exists', () => {
      const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'abi-test-'));
      const targetDir = path.join(tempHome, '.superconductor', 'skills', 'test.md');
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.writeFileSync(targetDir, 'some content');

      const report: ABIReport = {
        primaryTweak: {
          filename: 'test.md',
          description: 'test',
          search: '',
          replace: 'replacement'
        },
        candidateTweaks: [],
        retryCount: 1,
        criticalFindings: [],
        advisoryFindings: []
      };
      expect(() => ABI.applySkillTweak(report, tempHome)).toThrow('Invalid ABI tweak schema: search and replace must be defined.');
      fs.rmSync(tempHome, { recursive: true, force: true });
    });
  });

  describe('Focus 2 & 6: SwarmPhaseGate N=0, N=1, N=2 boundary testing', () => {
    const criticalOutput = [{
      reviewer_id: 'r1',
      raw_text: '```review-findings\n[{"finding_id":"1","severity":"critical","category":"sec","file":"a.ts","line_range":"L1","description":"crit","recommendation":"fix","is_security_critical":true}]\n```'
    }];

    it('N=0: retryCount = 0 returns REJECT and AUTO_REMEDIATE', () => {
      const res = evaluatePhaseGate({ reviewerOutputs: criticalOutput, retryCount: 0 });
      expect(res.status).toBe('REJECT');
      expect(res.next_action).toBe('AUTO_REMEDIATE');
    });

    it('N=1: retryCount = 1 returns REJECT and AUTO_REMEDIATE', () => {
      const res = evaluatePhaseGate({ reviewerOutputs: criticalOutput, retryCount: 1 });
      expect(res.status).toBe('REJECT');
      expect(res.next_action).toBe('AUTO_REMEDIATE');
    });

    it('N=2: retryCount = 2 returns ESCALATE and MANUAL_ESCALATION (blocked at 2)', () => {
      const res = evaluatePhaseGate({ reviewerOutputs: criticalOutput, retryCount: 2 });
      expect(res.status).toBe('ESCALATE');
      expect(res.next_action).toBe('MANUAL_ESCALATION');
    });
  });

  describe('Focus 3 & 6: PairProgramming loop falsy boundary bug (maxIterations = 0)', () => {
    it('demonstrates falsy fallback bug when maxIterations = 0', async () => {
      let codeIterations = 0;
      const result = await runPairProgrammingLoop({
        taskSpec: 'N=0 task',
        maxIterations: 0, // passing 0
        onCodeIteration: async () => {
          codeIterations++;
          return { diff: 'diff', modifiedFiles: ['f.ts'] };
        },
        onReviewIteration: async () => [{
          reviewer_id: 'r1',
          raw_text: '```review-findings\n[{"finding_id":"1","severity":"critical","category":"sec","file":"a.ts","line_range":"L1","description":"crit","recommendation":"fix","is_security_critical":true}]\n```'
        }]
      });

      // BUG FIXED: options.maxIterations ?? 2 evaluates 0 ?? 2 => 0.
      // So maxIterations becomes 0 instead of 2!
      // Thus codeIterations becomes 1 instead of 3.
      expect(codeIterations).toBe(1); // Demonstrates the bug is fixed
      expect(result.iterations).toBe(1);
    });

    it('PairProgramming N=1 maxIterations boundary', async () => {
      let attempts = 0;
      const result = await runPairProgrammingLoop({
        taskSpec: 'N=1 task',
        maxIterations: 1,
        onCodeIteration: async () => ({ diff: 'diff', modifiedFiles: ['f.ts'] }),
        onReviewIteration: async () => {
          attempts++;
          return [{
            reviewer_id: 'r1',
            raw_text: '```review-findings\n[{"finding_id":"1","severity":"critical","category":"sec","file":"a.ts","line_range":"L1","description":"crit","recommendation":"fix","is_security_critical":true}]\n```'
          }];
        }
      });

      expect(attempts).toBe(2); // attempt 0, 1
      expect(result.iterations).toBe(2);
      expect(result.success).toBe(false);
    });
  });
});
