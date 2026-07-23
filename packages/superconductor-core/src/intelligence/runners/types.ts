export interface RunnerResult<T = unknown> {
  status: 'ok' | 'degraded' | 'unavailable';
  entries?: T[] | null; // present only in scoped mode
}
