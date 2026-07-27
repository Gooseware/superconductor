import { ModelTier } from './model-tier-router.js';
import { TaskComplexityScore } from './task-complexity-scorer.js';

export interface PlannerTask {
  id: string;             // e.g. "phase1-task1"
  description: string;    // the task text from plan.md
  phase: string;          // phase identifier ("Phase 1", "Phase 2", etc.)
  tier: ModelTier;        // assigned by ModelTierRouter
  tcs: TaskComplexityScore;
  dependencies: string[]; // ids of tasks that must complete before this one
}

export interface SwarmWave {
  waveIndex: number;
  tasks: PlannerTask[];
  models: ModelTier[];
  estimatedTokens: number;
  estimatedMinutes: number;
}

export interface SwarmWaveSchedule {
  waves: SwarmWave[];
  totalTasks: number;
  totalEstimatedTokens: number;
  maxConcurrent: number;
}

export class ParallelismOptimiser {
  /**
   * Build a wave schedule from a list of tasks.
   * Tasks with no unmet dependencies go into the earliest possible wave.
   * maxConcurrent limits how many tasks can share a wave.
   */
  static schedule(tasks: PlannerTask[], maxConcurrent: number = 6): SwarmWaveSchedule {
    // 1. Build adjacency graph and in-degrees
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    
    for (const t of tasks) {
      if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
      if (!adj.has(t.id)) adj.set(t.id, []);
      
      for (const dep of t.dependencies) {
        if (!adj.has(dep)) adj.set(dep, []);
        adj.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
      }
    }

    // 2. Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }
    
    const sorted: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      sorted.push(u);
      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      }
    }

    if (sorted.length < tasks.length) {
      throw new Error("Cycle detected in task dependencies");
    }

    // 3 & 4. Pack tasks into waves
    const minWave = new Map<string, number>();
    const waves: SwarmWave[] = [];
    
    for (const id of sorted) {
      const task = tasks.find(t => t.id === id);
      if (!task) continue; // Should not happen

      let w = 0;
      for (const dep of task.dependencies) {
        const depWave = minWave.get(dep);
        if (depWave !== undefined && depWave + 1 > w) {
          w = depWave + 1;
        }
      }

      while (true) {
        if (!waves[w]) {
          waves[w] = { waveIndex: w, tasks: [], models: [], estimatedTokens: 0, estimatedMinutes: 0 };
        }
        if (waves[w].tasks.length < maxConcurrent) {
          waves[w].tasks.push(task);
          waves[w].models.push(task.tier);
          minWave.set(id, w);
          break;
        }
        w++;
      }
    }

    // Compact waves array
    const compactWaves = waves.filter(w => w !== undefined).map((w, i) => {
      w.waveIndex = i;
      return w;
    });

    let totalTasks = 0;
    let totalEstimatedTokens = 0;

    // 5 & 6. Compute estimates
    for (const wave of compactWaves) {
      let tokens = 0;
      let maxMinutes = 0;
      
      for (const t of wave.tasks) {
        let tok = 200000;
        let min = 2;
        switch (t.tier) {
          case 'flash-lite': tok = 80000; min = 1; break;
          case 'flash': tok = 200000; min = 2; break;
          case 'pro': tok = 600000; min = 5; break;
          case 'pro-thinking': tok = 1500000; min = 10; break;
        }
        tokens += tok;
        maxMinutes = Math.max(maxMinutes, min);
        totalTasks++;
      }
      
      wave.estimatedTokens = tokens;
      wave.estimatedMinutes = maxMinutes;
      totalEstimatedTokens += tokens;
    }

    return {
      waves: compactWaves,
      totalTasks,
      totalEstimatedTokens,
      maxConcurrent
    };
  }

  /**
   * Parse plan.md markdown and extract PlanTask[] with phase groupings.
   * Tasks within the same phase are assumed parallel (no intra-phase deps).
   * Tasks in later phases depend on all tasks in the immediately preceding phase.
   */
  static parsePlan(planMarkdown: string): PlannerTask[] {
    const lines = planMarkdown.split('\n');
    const tasks: PlannerTask[] = [];
    
    let currentPhaseStr = '';
    let currentPhaseNum = 0;
    let taskCounter = 0;
    let previousPhaseTaskIds: string[] = [];
    let currentPhaseTaskIds: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      const phaseMatch = line.match(/^##\s+(Phase\s+(\d+))/i);
      if (phaseMatch) {
        if (currentPhaseStr !== '') {
          previousPhaseTaskIds = currentPhaseTaskIds;
          currentPhaseTaskIds = [];
        }
        currentPhaseStr = phaseMatch[1]; // e.g. "Phase 1"
        currentPhaseNum = parseInt(phaseMatch[2], 10);
        taskCounter = 0;
        continue;
      }
      
      const taskMatch = line.match(/^-\s*\[([ xX])\]\s+(.*)/);
      if (taskMatch && currentPhaseStr) {
        taskCounter++;
        const id = `phase${currentPhaseNum}-task${taskCounter}`;
        const desc = taskMatch[2];
        
        let tier: ModelTier = 'flash';
        let total = 5;
        
        const annMatch = desc.match(/\[TIER-(\d+):TCS=(\d+)\]/);
        if (annMatch) {
          const tierNum = parseInt(annMatch[1], 10);
          total = parseInt(annMatch[2], 10);
          if (tierNum === 1) tier = 'flash-lite';
          else if (tierNum === 2) tier = 'flash';
          else if (tierNum === 3) tier = 'pro';
          else if (tierNum === 4) tier = 'pro-thinking';
        }
        
        const task: PlannerTask = {
          id,
          description: desc,
          phase: currentPhaseStr,
          tier,
          tcs: {
            contextLoad: 1,
            reasoningDepth: 1,
            crossCuttingRisk: 1,
            testSurface: 2,
            total,
            source: 'heuristic'
          },
          dependencies: [...previousPhaseTaskIds]
        };
        
        tasks.push(task);
        currentPhaseTaskIds.push(id);
      }
    }
    
    return tasks;
  }
}
