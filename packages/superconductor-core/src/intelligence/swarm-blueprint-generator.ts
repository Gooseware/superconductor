import { IntelligenceSnapshotReader, RepoContext } from './snapshot-reader.js';
import { TaskComplexityScorer } from './task-complexity-scorer.js';
import { ModelTierRouter } from './model-tier-router.js';
import { ParallelismOptimiser, PlannerTask, SwarmWaveSchedule } from './parallelism-optimiser.js';
import { TokenBudgetEstimator, TrackTokenBudget } from '../telemetry/token-budget-estimator.js';
import { OracleCadenceOptimiser } from './oracle-cadence-optimiser.js';

export interface SwarmBlueprint {
  waves: SwarmWaveSchedule;
  budget: TrackTokenBudget;
  oracleCadence: number;
  avgTCS: number;
  costSummary: string;
  repoContextSource: 'intelligence' | 'heuristic';
}

export class SwarmBlueprintGenerator {
  static generate(
    planMarkdown: string,
    options?: { outputDir?: string; projectRoot?: string; maxConcurrent?: number }
  ): SwarmBlueprint {
    let repoContext: RepoContext | null = null;
    let repoContextSource: 'intelligence' | 'heuristic' = 'heuristic';

    if (options?.outputDir) {
      const loaded = IntelligenceSnapshotReader.load(options.outputDir, options.projectRoot);
      if (loaded) {
        repoContext = loaded;
        repoContextSource = 'intelligence';
      }
    }

    const tasks = ParallelismOptimiser.parsePlan(planMarkdown);
    if (tasks.length === 0) {
      process.stderr.write('[superconductor:planner] SwarmBlueprintGenerator: parsePlan() returned 0 tasks — returning empty blueprint\n');
    }
    
    let totalTCS = 0;
    const updatedTasks = tasks.map(task => {
      const tcs = TaskComplexityScorer.score(task.description, repoContext || null);
      const tierAnnotation = ModelTierRouter.route(tcs);
      totalTCS += tcs.total;
      return {
        ...task,
        tcs,
        tier: tierAnnotation.tier
      };
    });

    const avgTCS = tasks.length > 0 ? totalTCS / tasks.length : 0;
    
    const waves = ParallelismOptimiser.schedule(updatedTasks, options?.maxConcurrent ?? 6);
    
    const budgetInput = updatedTasks.map(t => ({ tcs: t.tcs, tier: t.tier }));
    const budget = TokenBudgetEstimator.estimateTrack(budgetInput);
    
    const oracleCadence = OracleCadenceOptimiser.compute(tasks.length, avgTCS);
    
    const costSummary = TokenBudgetEstimator.formatCostEstimate(budget);

    return {
      waves,
      budget,
      oracleCadence,
      avgTCS,
      costSummary,
      repoContextSource
    };
  }

  static formatBlueprintSection(blueprint: SwarmBlueprint): string {
    let md = `## Swarm Blueprint\n\n`;
    md += `**Mode:** pipeline (phases sequential, tasks within phase parallel)\n`;
    md += `**Max Concurrent Agents:** 6\n`;
    
    let cadenceStr = 'adaptive';
    if (blueprint.oracleCadence > 0) {
      cadenceStr += ` (every ${blueprint.oracleCadence} tasks)`;
    }
    md += `**Oracle Cadence:** ${cadenceStr}\n`;
    md += `**Estimated Track Token Budget:** ${blueprint.costSummary}\n\n`;
    
    md += `### Wave Schedule\n\n`;
    md += `| Wave | Tasks | Models | Est. Tokens | Est. Duration |\n`;
    md += `|---|---|---|---|---|\n`;

    blueprint.waves.waves.forEach((wave, i) => {
      const models = [...new Set(wave.tasks.map(t => t.tier === 'flash-lite' ? 'flash_lite' : t.tier === 'pro-thinking' ? 'pro_thinking' : t.tier))].join(', ');
      
      let desc = wave.tasks.map(t => t.description).join('; ');
      if (desc.length > 50) {
        desc = desc.substring(0, 47) + '...';
      }
      
      const waveBudget = TokenBudgetEstimator.estimateTrack(wave.tasks.map(t => ({tcs: t.tcs, tier: t.tier})));
      const formattedTokens = Math.round(waveBudget.totalTokens / 1000) + 'K';
      const durationMin = Math.round(wave.tasks.length * 3);
      
      md += `| ${i + 1} | ${desc} | ${models} | ${formattedTokens} | ~${durationMin} min |\n`;
    });

    return md;
  }

  static annotatePlan(planMarkdown: string, blueprint: SwarmBlueprint): string {
    const lines = planMarkdown.split('\n');
    let taskIndex = 0;
    
    const allTasks = ParallelismOptimiser.parsePlan(planMarkdown);
    const waveTaskMap = new Map<string, PlannerTask>();
    blueprint.waves.waves.forEach(w => w.tasks.forEach(t => waveTaskMap.set(t.id, t)));

    return lines.map(line => {
      if (line.match(/^(\s*)-\s*\[([ xX])\]\s+/)) {
        const parsedTask = allTasks[taskIndex++];
        if (parsedTask) {
          const waveTask = waveTaskMap.get(parsedTask.id);
          if (waveTask) {
            const tcs = waveTask.tcs.total;
            let tierNum = 3;
            if (waveTask.tier === 'flash-lite') tierNum = 1;
            else if (waveTask.tier === 'flash') tierNum = 2;
            else if (waveTask.tier === 'pro') tierNum = 3;
            else if (waveTask.tier === 'pro-thinking') tierNum = 4;
            
            if (line.includes('[TIER-')) {
              return line.replace(/\[TIER-(\d+)(?::.*?)?\]/, `[TIER-$1:TCS=${tcs}]`);
            } else {
              return `${line} [TIER-${tierNum}:TCS=${tcs}]`;
            }
          }
        }
      }
      return line;
    }).join('\n');
  }
}
