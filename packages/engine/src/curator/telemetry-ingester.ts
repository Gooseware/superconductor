import { AgyStatusPayload, MetricQuery, TaskMetrics, TrackMetrics } from './telemetry.types.js';

export class TelemetryIngester {
  parseAgyStatusLine(line: string): AgyStatusPayload {
    throw new Error('Method not implemented.');
  }

  computeTokenToSuccessRatio(trackId: string): number {
    throw new Error('Method not implemented.');
  }

  computeEditMatchFailureRate(trackId: string): number {
    throw new Error('Method not implemented.');
  }

  computeEscalationFrequency(trackId: string): number {
    throw new Error('Method not implemented.');
  }

  computeTimeToGreen(taskId: string): number {
    throw new Error('Method not implemented.');
  }

  ingestStatusPayload(payload: AgyStatusPayload): void {
    throw new Error('Method not implemented.');
  }

  queryMetrics(query: MetricQuery): any {
    throw new Error('Method not implemented.');
  }
}
