import { SwarmWorkUnit } from './swarm-granularity.js';

export interface TaskPlanUnit extends SwarmWorkUnit {
  creates?: string[];
  protected?: string[];
  dependsOn?: string[];
}

export interface TaskWavePlannerOptions {
  maxConcurrent?: number;
}

function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegex(globPattern: string): RegExp {
  let regexStr = globPattern
    .replace(/[+^${}()|[\]\\]/g, '\\$&')
    .replace(/\./g, '\\.')
    .replace(/\/\*\*\//g, '(?:/|/.+/|/)')
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\/\*\*/g, '(?:/.*)?')
    .replace(/\*\*/g, '.*')
    .replace(/(?<!\.)\*/g, '[^/]*');
  return new RegExp(`^${regexStr}$`);
}

export function matchesFilePath(pattern: string, filePath: string): boolean {
  const normPattern = normalizePath(pattern);
  const normFile = normalizePath(filePath);
  if (!normPattern || !normFile) return false;
  if (normPattern === normFile) return true;
  if (normFile.endsWith('/' + normPattern) || normPattern.endsWith('/' + normFile)) {
    return true;
  }
  if (normPattern.includes('*')) {
    const regex = globToRegex(normPattern);
    if (regex.test(normFile)) return true;
  }
  if (normFile.includes('*')) {
    const regex = globToRegex(normFile);
    if (regex.test(normPattern)) return true;
  }
  return false;
}

function hasFileConflict(filesA?: string[], filesB?: string[]): boolean {
  if (!filesA || !filesB || filesA.length === 0 || filesB.length === 0) {
    return false;
  }
  for (const fa of filesA) {
    for (const fb of filesB) {
      if (matchesFilePath(fa, fb) || matchesFilePath(fb, fa)) {
        return true;
      }
    }
  }
  return false;
}

function parseInlineList(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === '[]' ||
    trimmed === '[ ]' ||
    trimmed.toLowerCase() === 'none' ||
    trimmed.toLowerCase() === 'n/a'
  ) {
    return [];
  }
  const stripped = trimmed.replace(/^\[|\]$/g, '').trim();
  if (!stripped) return [];
  return stripped
    .split(',')
    .map(s => s.trim().replace(/^['"`]|['"`]$/g, '').trim())
    .filter(Boolean);
}

function taskMatchesRef(u: TaskPlanUnit, ref: string): boolean {
  if (!ref || typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  if (!trimmed) return false;

  // Exact ID match (case-insensitive)
  if (u.id.toLowerCase() === trimmed.toLowerCase()) {
    return true;
  }

  // Task title match (ignoring optional "Task:" prefix)
  const cleanRef = trimmed.replace(/^Task:\s*/i, '').trim().toLowerCase();
  const cleanTask = u.task.replace(/^Task:\s*/i, '').trim().toLowerCase();
  if (cleanTask === cleanRef) {
    return true;
  }

  // File created by u
  if (u.creates && u.creates.length > 0) {
    for (const f of u.creates) {
      if (matchesFilePath(trimmed, f) || matchesFilePath(f, trimmed)) {
        return true;
      }
    }
  }

  return false;
}

function hasExplicitDependency(u: TaskPlanUnit, v: TaskPlanUnit): boolean {
  const refs = [...(v.dependsOn || []), ...(v.reuses || [])];
  for (const ref of refs) {
    if (taskMatchesRef(u, ref)) {
      return true;
    }
  }
  return false;
}

export class TaskWavePlanner {
  /**
   * Matches a file path against a pattern, supporting recursive globs, suffixes, and exact matches.
   */
  public static matchesFilePath(pattern: string, filePath: string): boolean {
    return matchesFilePath(pattern, filePath);
  }

  /**
   * Parse full plan markdown with CREATES, PROTECTED, and DEPENDS tags per task
   */
  public static parsePlanWithDependencies(planMarkdown: string): TaskPlanUnit[] {
    const units: TaskPlanUnit[] = [];
    let phase = 0;
    let autoId = 0;

    const lines = planMarkdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track phase
      if (/^## Phase \d+/i.test(line)) {
        const m = line.match(/Phase (\d+)/i);
        if (m) phase = parseInt(m[1], 10);
      }

      // Match task lines
      const taskLineMatch = line.match(/^\s*-\s*\[[ xX]?\]\s*Task:\s*(.+)$/i);
      if (taskLineMatch) {
        let taskTitleRaw = taskLineMatch[1].trim();

        // Extract explicit ID if present, e.g. [ID:wu-1] or [wu-1]
        let unitId = `wu-${autoId++}`;
        const idMatch = taskTitleRaw.match(/\[(?:ID:)?([a-zA-Z0-9_-]+)\]/i);
        // Only treat as ID if it's not TIER, AGENT, or DOMAIN
        if (idMatch && !/^(?:TIER|AGENT|DOMAIN)/i.test(idMatch[1])) {
          unitId = idMatch[1];
          taskTitleRaw = taskTitleRaw.replace(idMatch[0], '').trim();
        }

        // Extract TIER
        let tier = 2;
        const tierMatch = taskTitleRaw.match(/\[TIER-(\d+)(?::[^\]]+)?\]/i);
        if (tierMatch) {
          tier = parseInt(tierMatch[1], 10);
          taskTitleRaw = taskTitleRaw.replace(tierMatch[0], '').trim();
        }

        // Extract AGENT
        let agent = 'superconductor-processor';
        const agentMatch = taskTitleRaw.match(/\[AGENT:([^\]]+)\]/i);
        if (agentMatch) {
          agent = agentMatch[1].trim();
          taskTitleRaw = taskTitleRaw.replace(agentMatch[0], '').trim();
        }

        // Extract DOMAIN
        let domain = 'default';
        const domainMatch = taskTitleRaw.match(/\[DOMAIN:([^\]]+)\]/i);
        if (domainMatch) {
          domain = domainMatch[1].trim();
          taskTitleRaw = taskTitleRaw.replace(domainMatch[0], '').trim();
        }

        const unit: TaskPlanUnit = {
          id: unitId,
          task: taskTitleRaw,
          tier,
          agent,
          domain,
          phase,
        };

        const createsList: string[] = [];
        const protectedList: string[] = [];
        const dependsList: string[] = [];
        const reusesList: string[] = [];

        let currentTag: 'creates' | 'protected' | 'depends' | 'reuses' | null = null;

        // Scan subsequent lines for metadata until next parent task or phase
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];

          // Next parent task or phase heading terminates task block
          if (/^\s*-\s*\[[ xX]?\]\s*Task:/i.test(nextLine) || /^##/i.test(nextLine)) {
            break;
          }

          // Check if line starts a metadata tag
          const createsMatch = nextLine.match(/^\s*CREATES:\s*(.*)/i);
          if (createsMatch) {
            currentTag = 'creates';
            const inlineItems = parseInlineList(createsMatch[1]);
            if (inlineItems.length > 0) {
              createsList.push(...inlineItems);
              currentTag = null;
            }
            continue;
          }

          const protectedMatch = nextLine.match(/^\s*PROTECTED:\s*(.*)/i);
          if (protectedMatch) {
            currentTag = 'protected';
            const inlineItems = parseInlineList(protectedMatch[1]);
            if (inlineItems.length > 0) {
              protectedList.push(...inlineItems);
              currentTag = null;
            }
            continue;
          }

          const dependsMatch = nextLine.match(/^\s*DEPENDS(?:\s*ON|_ON)?:\s*(.*)/i);
          if (dependsMatch) {
            currentTag = 'depends';
            const inlineItems = parseInlineList(dependsMatch[1]);
            if (inlineItems.length > 0) {
              dependsList.push(...inlineItems);
              currentTag = null;
            }
            continue;
          }

          const reusesMatch = nextLine.match(/^\s*REUSES:\s*(.*)/i);
          if (reusesMatch) {
            currentTag = 'reuses';
            const inlineItems = parseInlineList(reusesMatch[1]);
            if (inlineItems.length > 0) {
              reusesList.push(...inlineItems);
              currentTag = null;
            }
            continue;
          }

          // Subtask check: terminates active multi-line list tag
          if (/^\s*-\s*\[[ xX]?\]/i.test(nextLine)) {
            currentTag = null;
            continue;
          }

          // Other known metadata tags (e.g. INVARIANT_AFTER) reset active tag
          if (/^\s*[A-Z_]+:\s*/i.test(nextLine)) {
            currentTag = null;
            continue;
          }

          // Bullet item within active tag
          if (currentTag !== null) {
            const bulletMatch = nextLine.match(/^\s*[-*]\s+(.*)$/);
            if (bulletMatch) {
              const inlineItems = parseInlineList(bulletMatch[1]);
              if (inlineItems.length > 0) {
                if (currentTag === 'creates') createsList.push(...inlineItems);
                else if (currentTag === 'protected') protectedList.push(...inlineItems);
                else if (currentTag === 'depends') dependsList.push(...inlineItems);
                else if (currentTag === 'reuses') reusesList.push(...inlineItems);
              }
            } else if (nextLine.trim() !== '') {
              // Non-bullet, non-blank line terminates the active tag
              currentTag = null;
            }
          }
        }

        if (createsList.length > 0) unit.creates = createsList;
        if (protectedList.length > 0) unit.protected = protectedList;
        if (dependsList.length > 0) unit.dependsOn = dependsList;
        if (reusesList.length > 0) unit.reuses = reusesList;

        units.push(unit);
      }
    }

    return units;
  }

  /**
   * Partitions all dispatchable tasks into topological waves (antichains).
   * Tasks from different phases that have no conflicting CREATES/PROTECTED files
   * and no explicit dependencies are placed into the SAME wave to maximize concurrency!
   */
  public static planTaskWaves(
    units: TaskPlanUnit[],
    options?: TaskWavePlannerOptions
  ): TaskPlanUnit[][] {
    if (!units || units.length === 0) {
      return [];
    }

    const maxConcurrent =
      options?.maxConcurrent && options.maxConcurrent > 0 ? options.maxConcurrent : 5;

    // Track original order for deterministic tie-breaking
    const originalIndex = new Map<string, number>();
    units.forEach((u, i) => originalIndex.set(u.id, i));

    // Construct adjacency list G = (V, E)
    // Edge u -> v means u must complete before v can start (v depends on u)
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const u of units) {
      adj.set(u.id, new Set<string>());
      inDegree.set(u.id, 0);
    }

    const addEdge = (uId: string, vId: string) => {
      if (uId === vId) return;
      const neighbors = adj.get(uId);
      if (neighbors && !neighbors.has(vId)) {
        neighbors.add(vId);
        inDegree.set(vId, (inDegree.get(vId) ?? 0) + 1);
      }
    };

    // Determine edges
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const v = units[j];

        // 1. Task v explicitly lists Task u in dependsOn or REUSES
        if (hasExplicitDependency(u, v)) {
          addEdge(u.id, v.id);
          continue;
        }

        // 2a. Task u declares creates a file that Task v declares in protected (write-read hazard)
        if (hasFileConflict(u.creates, v.protected)) {
          addEdge(u.id, v.id);
          continue;
        }

        // 2b. Task u declares creates a file that Task v declares in creates (write-write hazard)
        // Sequenced in plan order (earlier task executes first)
        if (i < j && hasFileConflict(u.creates, v.creates)) {
          addEdge(u.id, v.id);
          continue;
        }
      }
    }

    const waves: TaskPlanUnit[][] = [];
    const remaining = new Map<string, TaskPlanUnit>();
    for (const unit of units) {
      remaining.set(unit.id, unit);
    }

    while (remaining.size > 0) {
      // Find all unblocked candidates (inDegree === 0)
      const candidates: TaskPlanUnit[] = [];
      for (const [id, unit] of remaining.entries()) {
        if ((inDegree.get(id) ?? 0) === 0) {
          candidates.push(unit);
        }
      }

      if (candidates.length === 0) {
        throw new Error('Cyclical task dependencies detected in plan');
      }

      // Sort by tier descending, with stable tie-break by original index
      candidates.sort((a, b) => {
        const tierA = a.tier ?? 2;
        const tierB = b.tier ?? 2;
        if (tierB !== tierA) {
          return tierB - tierA;
        }
        return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
      });

      // Cap to maxConcurrent
      const selected = candidates.slice(0, maxConcurrent);
      waves.push(selected);

      // Decrement inDegree for successors and remove selected from remaining
      for (const unit of selected) {
        remaining.delete(unit.id);
        const neighbors = adj.get(unit.id);
        if (neighbors) {
          for (const neighborId of neighbors) {
            const currentDeg = inDegree.get(neighborId) ?? 0;
            inDegree.set(neighborId, Math.max(0, currentDeg - 1));
          }
        }
      }
    }

    return waves;
  }

  /**
   * Validates that an orchestrator does not collapse concurrency when wave 0 has multiple decoupled tasks.
   * If wave 0 contains 2 or more decoupled tasks, dispatching only 1 agent is a protocol violation.
   */
  public static validateConcurrency(
    waves: TaskPlanUnit[][],
    actualDispatchedCount: number
  ): void {
    validateConcurrency(waves, actualDispatchedCount);
  }
}

/**
 * Validates that an orchestrator does not collapse concurrency when wave 0 has multiple decoupled tasks.
 * If wave 0 contains 2 or more decoupled tasks, dispatching only 1 agent is a protocol violation.
 */
export function validateConcurrency(
  waves: TaskPlanUnit[][],
  actualDispatchedCount: number
): void {
  if (
    waves &&
    waves.length > 0 &&
    waves[0] &&
    waves[0].length >= 2 &&
    actualDispatchedCount === 1
  ) {
    throw new Error(
      '[Superconductor] Concurrency Collapse Detected: Wave 0 contains multiple decoupled tasks, but only 1 agent was dispatched. Antichain swarm requires parallel batching.'
    );
  }
}

