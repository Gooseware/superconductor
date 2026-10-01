/**
 * Swarm Granularity Protocol Utilities
 *
 * Implements the protocol-level rules described in the swarm-execute SKILL.md:
 *   - 1:1 WorkUnit mapping per annotated task line (parseWorkUnits)
 *   - TIER-1 pre-filter exclusion from subagent dispatch (filterForSubagentDispatch)
 *   - Minimum concurrency gate enforcement (buildBatches, validateBatches)
 *
 * These functions are the canonical implementation of those rules and are
 * imported by orchestration tests to provide real coverage (not inline stubs).
 */

/**
 * A single unit of work parsed from a plan.md annotated task line.
 * Matches the swarm-execute WorkUnit contract.
 */
export interface SwarmWorkUnit {
  id: string;
  task: string;
  tier: number;
  agent: string;
  domain: string;
  phase: number;
  reuses?: string[];
}

/**
 * Parse a plan.md markdown string and produce one SwarmWorkUnit per annotated
 * task line. Each `- [ ] Task: ... [TIER-N] [AGENT:...] [DOMAIN:...]` line
 * maps to exactly one work unit — merging tasks across domains is a protocol
 * violation.
 *
 * @param planMarkdown - Raw markdown content of a plan.md file.
 * @returns Array of SwarmWorkUnit, one per matching task line.
 */
export function parseWorkUnits(planMarkdown: string): SwarmWorkUnit[] {
  const units: SwarmWorkUnit[] = [];
  let phase = 0;
  let id = 0;

  const lines = planMarkdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current phase heading
    if (/^## Phase \d+/i.test(line)) {
      const m = line.match(/Phase (\d+)/i);
      if (m) phase = parseInt(m[1], 10);
    }

    // Match annotated task lines
    const taskMatch = line.match(
      /^- \[ \] Task: (.+?) \[TIER-(\d+)(?::[^\]]+)?\] \[AGENT:([^\]]+)\] \[DOMAIN:([^\]]+)\]/
    );
    if (taskMatch) {
      const unit: SwarmWorkUnit = {
        id: `wu-${id++}`,
        task: taskMatch[1],
        tier: parseInt(taskMatch[2], 10),
        agent: taskMatch[3],
        domain: taskMatch[4],
        phase,
      };

      // Check subsequent lines for optional REUSES tag before next task or phase heading
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (/^- \[ \] Task:/i.test(nextLine) || /^## Phase/i.test(nextLine)) {
          break;
        }
        if (/^\s*REUSES:\s*(.*)/i.test(nextLine)) {
          const reusesMatch = nextLine.match(/^\s*REUSES:\s*(.*)/i);
          const rest = reusesMatch ? reusesMatch[1].trim() : '';
          const reusesList: string[] = [];

          if (rest) {
            if (
              rest !== '[]' &&
              rest !== '[ ]' &&
              rest.toLowerCase() !== 'none' &&
              rest.toLowerCase() !== 'n/a'
            ) {
              const stripped = rest.replace(/^\[|\]$/g, '').trim();
              if (stripped) {
                reusesList.push(
                  ...stripped
                    .split(',')
                    .map(s => s.trim().replace(/^['"`]|['"`]$/g, ''))
                    .filter(Boolean)
                );
              }
            }
          } else {
            // Multi-line list under REUSES:
            for (let k = j + 1; k < lines.length; k++) {
              const mLine = lines[k];
              if (!mLine.trim()) continue;
              if (
                /^\s*[A-Z_]+:\s*/i.test(mLine) ||
                /^\s*-\s*\[[ xX]\]/i.test(mLine) ||
                /^##/i.test(mLine)
              ) {
                break;
              }
              const bulletMatch = mLine.match(/^\s*[-*]\s+(.*)$/);
              if (bulletMatch) {
                const cleaned = bulletMatch[1].trim().replace(/^['"`]|['"`]$/g, '');
                if (cleaned) reusesList.push(cleaned);
              } else {
                break;
              }
            }
          }

          if (reusesList.length > 0) {
            unit.reuses = reusesList;
          }
          break;
        }
      }

      units.push(unit);
    }
  }

  return units;
}

/**
 * Filter work units to only those eligible for subagent dispatch.
 * TIER-1 tasks are executed inline by the orchestrator; only TIER-2+ tasks
 * are dispatched to subagents. Sending TIER-1 tasks to the dispatch pipeline
 * is a protocol violation.
 *
 * @param units - All parsed work units.
 * @returns Work units with tier >= 2 (subagent-dispatchable).
 */
export function filterForSubagentDispatch(units: SwarmWorkUnit[]): SwarmWorkUnit[] {
  return units.filter(u => u.tier >= 2);
}

/**
 * Partition work units into batches of at most `maxConcurrent` items each.
 * Each batch is dispatched concurrently; the minimum concurrency gate requires
 * that every non-final batch is filled to `maxConcurrent`.
 *
 * @param units - Work units to batch (should already be TIER-2+ filtered).
 * @param maxConcurrent - Maximum agents dispatched simultaneously.
 * @returns Array of batches, each a slice of `units`.
 */
export function buildBatches(units: SwarmWorkUnit[], maxConcurrent: number): SwarmWorkUnit[][] {
  const batches: SwarmWorkUnit[][] = [];
  for (let i = 0; i < units.length; i += maxConcurrent) {
    batches.push(units.slice(i, i + maxConcurrent));
  }
  return batches;
}

/**
 * Validate that batches satisfy the minimum concurrency gate.
 * Every batch except possibly the last must contain exactly `maxConcurrent`
 * work units. Undersizing batches is a protocol violation that reduces
 * parallelism below the declared minimum.
 *
 * @param batches - Batches to validate.
 * @param maxConcurrent - Required minimum batch size (except final remainder).
 * @param totalUnits - Total number of work units across all batches.
 * @returns Array of violation messages; empty if batches are correctly sized.
 */
export function validateBatches(
  batches: SwarmWorkUnit[][],
  maxConcurrent: number,
  totalUnits: number
): string[] {
  const violations: string[] = [];
  let processed = 0;

  for (let i = 0; i < batches.length; i++) {
    const remaining = totalUnits - processed;
    const required = Math.min(remaining, maxConcurrent);
    if (batches[i].length < required) {
      violations.push(
        `CONCURRENCY VIOLATION: batch[${i}] size ${batches[i].length} < required ${required}`
      );
    }
    processed += batches[i].length;
  }

  return violations;
}
