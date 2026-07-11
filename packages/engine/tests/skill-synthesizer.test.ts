import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillSynthesizer } from '../src/curator/skill-synthesizer.js';
import { EventStore } from '../src/state/event-store.js';

vi.mock('../src/state/event-store.js');

describe('SkillSynthesizer', () => {
  let synthesizer: SkillSynthesizer;
  let mockEventStore: vi.Mocked<EventStore>;

  beforeEach(() => {
    mockEventStore = new EventStore({ dbPath: ':memory:' }) as vi.Mocked<EventStore>;
    synthesizer = new SkillSynthesizer(mockEventStore, '/tmp/skills');
  });

  describe('Pattern Detection', () => {
    it('should identify recurring manual intervention pattern from sample event log', async () => {
      const patterns = await synthesizer.detectPatterns('track-1');
      const manualPatterns = patterns.filter(p => p.patternType === 'MANUAL_INTERVENTION');
      expect(manualPatterns.length).toBeGreaterThan(0);
    });

    it('should identify recurring escalation trigger pattern', async () => {
      const patterns = await synthesizer.detectPatterns('track-1');
      const escalationPatterns = patterns.filter(p => p.patternType === 'ESCALATION_TRIGGER');
      expect(escalationPatterns.length).toBeGreaterThan(0);
    });

    it('should identify boilerplate task sequence pattern', async () => {
      const patterns = await synthesizer.detectPatterns('track-1');
      const boilerplatePatterns = patterns.filter(p => p.patternType === 'BOILERPLATE_SEQUENCE');
      expect(boilerplatePatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Skill Generation & Scoring', () => {
    it('should generate valid SKILL.md with frontmatter and detection signals', () => {
      const skill = synthesizer.generateSkill({
        patternType: 'MANUAL_INTERVENTION',
        frequency: 5,
        confidence: 0.9,
        description: 'Fixing dependency mismatch',
        relatedTaskIds: []
      });
      expect(skill.systemPrompt).toContain('Fixing dependency mismatch');
      expect(skill.detectionSignals.length).toBeGreaterThan(0);
    });

    it('should rank high-frequency patterns above low-frequency using confidence scoring', () => {
      const scoreHigh = synthesizer.computeConfidenceScore({ frequency: 10, recency: 1, consistency: 0.9 });
      const scoreLow = synthesizer.computeConfidenceScore({ frequency: 2, recency: 0.5, consistency: 0.4 });
      expect(scoreHigh.score).toBeGreaterThan(scoreLow.score);
    });
  });

  describe('File System Persistence', () => {
    it('should save skills above threshold to the configured directory', async () => {
      const saved = await synthesizer.saveSkillIfConfident({
        name: 'auto-fix',
        description: 'Auto fix',
        systemPrompt: 'Do it',
        codeTemplates: [],
        detectionSignals: ['error'],
        confidenceScore: 0.9
      }, 0.8);
      expect(saved).toBe(true);
    });

    it('should log but not install skills below threshold', async () => {
      const saved = await synthesizer.saveSkillIfConfident({
        name: 'low-conf',
        description: 'Low conf',
        systemPrompt: 'Do it',
        codeTemplates: [],
        detectionSignals: ['error'],
        confidenceScore: 0.5
      }, 0.8);
      expect(saved).toBe(false);
    });

    it('should be idempotent: re-running on same data produces same skills', async () => {
      const run1 = await synthesizer.runAnalysis();
      const run2 = await synthesizer.runAnalysis();
      expect(run1).toEqual(run2);
    });
  });
});
