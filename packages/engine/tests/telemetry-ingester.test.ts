import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelemetryIngester } from '../src/curator/telemetry-ingester.js';
import { AgyStatusPayload } from '../src/curator/telemetry.types.js';

describe('TelemetryIngester', () => {
  let ingester: TelemetryIngester;

  beforeEach(() => {
    ingester = new TelemetryIngester();
  });

  describe('AGY Status parsing', () => {
    it('should parse AGY status line JSON into typed AgyStatusPayload', () => {
      const line = '{"tokensUsed": 1500, "contextSize": 8000, "state": "GREEN", "taskId": "task-1", "timestamp": "2026-07-11T00:00:00Z"}';
      const payload = ingester.parseAgyStatusLine(line);
      expect(payload).toEqual({
        tokensUsed: 1500,
        contextSize: 8000,
        state: 'GREEN',
        taskId: 'task-1',
        timestamp: '2026-07-11T00:00:00Z'
      });
    });
  });

  describe('Metrics Computation', () => {
    it('should compute Token-to-Success Ratio from task events', () => {
      const ratio = ingester.computeTokenToSuccessRatio('track-1');
      expect(ratio).toBeGreaterThan(0);
    });

    it('should compute Edit Match Failure Rate from diff events', () => {
      const rate = ingester.computeEditMatchFailureRate('track-1');
      expect(rate).toBeDefined();
    });

    it('should compute Escalation Frequency from routing events', () => {
      const frequency = ingester.computeEscalationFrequency('track-1');
      expect(frequency).toBeDefined();
    });

    it('should compute Time-to-Green from TDD phase timestamps', () => {
      const timeToGreen = ingester.computeTimeToGreen('task-1');
      expect(timeToGreen).toBeGreaterThan(0);
    });
  });

  describe('Storage & Querying', () => {
    it('should store metrics in SQLite with proper indexing', () => {
      const payload: AgyStatusPayload = {
        tokensUsed: 500,
        contextSize: 2000,
        state: 'RED',
        taskId: 'task-1',
        trackId: 'track-1',
        timestamp: new Date().toISOString()
      };
      expect(() => ingester.ingestStatusPayload(payload)).not.toThrow();
    });

    it('should query metrics by task ID, track ID, and time range', () => {
      const metrics = ingester.queryMetrics({ trackId: 'track-1' });
      expect(metrics).toBeDefined();
    });
  });
});
