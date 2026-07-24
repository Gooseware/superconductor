export class OracleCadenceOptimiser {
  /**
   * Compute optimal oracle firing cadence.
   * @param taskCount - total tasks in the plan
   * @param avgTCS - average TCS total across all tasks (0-20)
   * @param historicalRetryRate - optional, 0.0-1.0, fraction of tasks that needed retries
   * @returns cadence: oracle fires every N tasks (minimum 1)
   */
  static compute(
    taskCount: number,
    avgTCS: number,
    historicalRetryRate?: number
  ): number {
    // Base: oracle every ~25% of tasks
    let cadence = Math.ceil(taskCount / 4);

    // TCS modifier: higher complexity = more frequent oracle
    cadence = Math.max(1, cadence - Math.floor(avgTCS / 5));

    // Retry rate modifier: high retry rate = more frequent oracle
    if (historicalRetryRate !== undefined && historicalRetryRate > 0.3) {
      cadence = Math.max(1, cadence - 1);
    }

    return cadence;
  }
}
