import { describe, it, expect } from 'vitest';

// Stub types matching the swarm-execute WorkUnit contract
interface WorkUnit {
  id: string;
  task: string;
  tier: number;
  agent: string;
  domain: string;
  phase: number;
}

// ---------------------------------------------------------------------------
// Suite 1 — parseAndDispatch 1:1 mapping
// Each `- [ ] Task:` line with annotations must produce exactly one WorkUnit.
// ---------------------------------------------------------------------------
describe('parseAndDispatch — 1:1 WorkUnit mapping', () => {
  function parseWorkUnits(planMarkdown: string): WorkUnit[] {
    const units: WorkUnit[] = [];
    const taskRegex = /^- \[ \] Task: (.+?) \[TIER-(\d+)\] \[AGENT:([^\]]+)\] \[DOMAIN:([^\]]+)\]/gm;
    let match: RegExpExecArray | null;
    let phase = 0;
    let id = 0;
    for (const line of planMarkdown.split('\n')) {
      if (/^## Phase \d+/.test(line)) {
        const m = line.match(/Phase (\d+)/);
        if (m) phase = parseInt(m[1]);
      }
      const taskMatch = line.match(/^- \[ \] Task: (.+?) \[TIER-(\d+)\] \[AGENT:([^\]]+)\] \[DOMAIN:([^\]]+)\]/);
      if (taskMatch) {
        units.push({
          id: `wu-${id++}`,
          task: taskMatch[1],
          tier: parseInt(taskMatch[2]),
          agent: taskMatch[3],
          domain: taskMatch[4],
          phase,
        });
      }
    }
    return units;
  }

  it('produces exactly one WorkUnit per task line', () => {
    const plan = `
## Phase 0
- [ ] Task: Scaffold skeleton [TIER-1] [AGENT:setup] [DOMAIN:tests]

## Phase 1
- [ ] Task: Amend swarm-execute [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-swarm-execute]
- [ ] Task: Amend implement [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-implement]
- [ ] Task: Write tests [TIER-2] [AGENT:coding-agent] [DOMAIN:tests]

## Phase 2
- [ ] Task: Consistency check [TIER-1] [AGENT:setup] [DOMAIN:validation]
`;
    const units = parseWorkUnits(plan);
    expect(units).toHaveLength(5);
  });

  it('never merges two tasks from different domains into one WorkUnit', () => {
    const plan = `
## Phase 1
- [ ] Task: Task A [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-swarm-execute]
- [ ] Task: Task B [TIER-2] [AGENT:coding-agent] [DOMAIN:skills-implement]
`;
    const units = parseWorkUnits(plan);
    expect(units).toHaveLength(2);
    expect(units[0].domain).toBe('skills-swarm-execute');
    expect(units[1].domain).toBe('skills-implement');
  });

  it('preserves TIER annotation per WorkUnit', () => {
    const plan = `
## Phase 0
- [ ] Task: Shell task [TIER-1] [AGENT:setup] [DOMAIN:tests]
## Phase 1
- [ ] Task: Coding task [TIER-2] [AGENT:coding-agent] [DOMAIN:logic]
`;
    const units = parseWorkUnits(plan);
    expect(units[0].tier).toBe(1);
    expect(units[1].tier).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — TIER-1 Pre-Filter
// TIER-1 WorkUnits must be excluded from the subagent dispatch pipeline.
// ---------------------------------------------------------------------------
describe('TIER-1 Pre-Filter — exclusion from subagent dispatch pipeline', () => {
  function filterForSubagentDispatch(units: WorkUnit[]): WorkUnit[] {
    // Only TIER-2+ goes to subagents; TIER-1 is executed inline
    return units.filter(u => u.tier >= 2);
  }

  it('removes all TIER-1 WorkUnits before subagent dispatch', () => {
    const units: WorkUnit[] = [
      { id: 'wu-0', task: 'Scaffold', tier: 1, agent: 'setup', domain: 'tests', phase: 0 },
      { id: 'wu-1', task: 'Amend A', tier: 2, agent: 'coding-agent', domain: 'skills-a', phase: 1 },
      { id: 'wu-2', task: 'Amend B', tier: 2, agent: 'coding-agent', domain: 'skills-b', phase: 1 },
      { id: 'wu-3', task: 'Validate', tier: 1, agent: 'setup', domain: 'validation', phase: 2 },
    ];
    const dispatchable = filterForSubagentDispatch(units);
    expect(dispatchable).toHaveLength(2);
    expect(dispatchable.every(u => u.tier >= 2)).toBe(true);
  });

  it('returns empty array if all WorkUnits are TIER-1', () => {
    const units: WorkUnit[] = [
      { id: 'wu-0', task: 'Shell A', tier: 1, agent: 'setup', domain: 'infra', phase: 0 },
      { id: 'wu-1', task: 'Shell B', tier: 1, agent: 'setup', domain: 'infra', phase: 0 },
    ];
    expect(filterForSubagentDispatch(units)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Minimum Concurrency Gate
// Each batch must contain exactly min(pending, maxConcurrent) agents.
// Dispatching fewer is a protocol violation.
// ---------------------------------------------------------------------------
describe('Minimum Concurrency Gate — batch sizing enforcement', () => {
  function buildBatches(units: WorkUnit[], maxConcurrent: number): WorkUnit[][] {
    const batches: WorkUnit[][] = [];
    for (let i = 0; i < units.length; i += maxConcurrent) {
      batches.push(units.slice(i, i + maxConcurrent));
    }
    return batches;
  }

  function validateBatches(batches: WorkUnit[][], maxConcurrent: number, totalUnits: number): string[] {
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

  it('produces batches of exactly maxConcurrent for 9 WorkUnits with maxConcurrent=4', () => {
    const units: WorkUnit[] = Array.from({ length: 9 }, (_, i) => ({
      id: `wu-${i}`, task: `Task ${i}`, tier: 2,
      agent: 'coding-agent', domain: `domain-${i}`, phase: 1,
    }));
    const batches = buildBatches(units, 4);
    expect(batches[0]).toHaveLength(4);
    expect(batches[1]).toHaveLength(4);
    expect(batches[2]).toHaveLength(1); // final remainder
  });

  it('detects a concurrency violation when batches are undersized', () => {
    // Simulates the bug: agent manually grouped [2, 2, 3] instead of [4, 4, 1]
    const undersizedBatches: WorkUnit[][] = [
      Array.from({ length: 2 }, (_, i) => ({ id: `wu-${i}`, task: `T${i}`, tier: 2, agent: 'c', domain: 'd', phase: 1 })),
      Array.from({ length: 2 }, (_, i) => ({ id: `wu-${i+2}`, task: `T${i+2}`, tier: 2, agent: 'c', domain: 'd', phase: 1 })),
      Array.from({ length: 3 }, (_, i) => ({ id: `wu-${i+4}`, task: `T${i+4}`, tier: 2, agent: 'c', domain: 'd', phase: 1 })),
    ];
    const violations = validateBatches(undersizedBatches, 4, 7);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('CONCURRENCY VIOLATION');
  });

  it('no violations when batches are correctly sized', () => {
    const units: WorkUnit[] = Array.from({ length: 9 }, (_, i) => ({
      id: `wu-${i}`, task: `Task ${i}`, tier: 2,
      agent: 'coding-agent', domain: `domain-${i}`, phase: 1,
    }));
    const batches = buildBatches(units, 4);
    const violations = validateBatches(batches, 4, 9);
    expect(violations).toHaveLength(0);
  });
});
