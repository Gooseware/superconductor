import { describe, it, expect, beforeEach } from 'vitest';
import { ResearchSourceQualityGate, ResearchSource } from '../../src/research/source-quality-gate';

describe('ResearchSourceQualityGate', () => {
  let gate: ResearchSourceQualityGate;

  beforeEach(() => {
    gate = new ResearchSourceQualityGate();
  });

  it('should block unknown source types', () => {
    const source: ResearchSource = {
      type: 'alien',
      url: 'https://example.com'
    };
    const result = gate.evaluate(source);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('Unknown source type');
  });

  describe('GitHub Rules', () => {
    it('should block repos missing required metadata', () => {
      const source: ResearchSource = {
        type: 'github',
        url: 'https://github.com/foo/bar',
        lastCommitDaysAgo: 10,
        license: 'MIT'
      };
      const result = gate.evaluate(source);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('Missing required metadata');
    });
    it('should block GPL license', () => {
      const source: ResearchSource = {
        type: 'github',
        url: 'https://github.com/foo/bar',
        stars: 150,
        lastCommitDaysAgo: 10,
        license: 'GPL-3.0'
      };
      const result = gate.evaluate(source);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('license must be one of');
    });

    it('should block abandoned repos (> 365 days)', () => {
      const source: ResearchSource = {
        type: 'github',
        url: 'https://github.com/foo/bar',
        stars: 150,
        lastCommitDaysAgo: 400,
        license: 'MIT'
      };
      const result = gate.evaluate(source);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('last commit must be <= 365 days ago');
    });

    it('should block repos with insufficient stars (< 100)', () => {
      const source: ResearchSource = {
        type: 'github',
        url: 'https://github.com/foo/bar',
        stars: 50,
        lastCommitDaysAgo: 10,
        license: 'MIT'
      };
      const result = gate.evaluate(source);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('>= 100 stars');
    });

    it('should pass fresh MIT repos with >= 100 stars', () => {
      const source: ResearchSource = {
        type: 'github',
        url: 'https://github.com/foo/bar',
        stars: 200,
        lastCommitDaysAgo: 50,
        license: 'MIT'
      };
      const result = gate.evaluate(source);
      expect(result.passed).toBe(true);
    });
  });

  describe('Paper Rules', () => {
    it('should pass arxiv.org URLs', () => {
      const source: ResearchSource = {
        type: 'paper',
        url: 'https://arxiv.org/abs/1234.5678'
      };
      expect(gate.evaluate(source).passed).toBe(true);
    });

    it('should pass neurips.cc URLs', () => {
      const source: ResearchSource = {
        type: 'paper',
        url: 'https://papers.neurips.cc/paper/something'
      };
      expect(gate.evaluate(source).passed).toBe(true);
    });

    it('should block other URLs', () => {
      const source: ResearchSource = {
        type: 'paper',
        url: 'https://example.com/paper.pdf'
      };
      expect(gate.evaluate(source).passed).toBe(false);
    });
  });

  describe('Community Rules', () => {
    it('should pass stackoverflow.com URLs', () => {
      const source: ResearchSource = {
        type: 'community',
        url: 'https://stackoverflow.com/questions/123/how-to-do'
      };
      expect(gate.evaluate(source).passed).toBe(true);
    });

    it('should pass trusted docs URLs', () => {
      const source: ResearchSource = {
        type: 'community',
        url: 'https://docs.docker.com/engine/'
      };
      expect(gate.evaluate(source).passed).toBe(true);
    });

    it('should block malicious docs.* domains', () => {
      const source: ResearchSource = {
        type: 'community',
        url: 'https://docs.malicious.com/engine/'
      };
      expect(gate.evaluate(source).passed).toBe(false);
    });

    it('should pass developer.mozilla.org URLs', () => {
      const source: ResearchSource = {
        type: 'community',
        url: 'https://developer.mozilla.org/en-US/docs/Web'
      };
      expect(gate.evaluate(source).passed).toBe(true);
    });

    it('should block other URLs', () => {
      const source: ResearchSource = {
        type: 'community',
        url: 'https://random-forum.com/thread/1'
      };
      expect(gate.evaluate(source).passed).toBe(false);
    });
  });
});
