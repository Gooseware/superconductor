import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getAgentContext } from '../protocol/agent-context.js';
import { readTrackRegistry, getCompletionStats } from '../track/index.js';
import { runDeterministicPreflight } from '../review/deterministic-preflight.js';
import { resolveReviewInput } from '../review/input-resolution.js';
import { runCliDispatcher } from './dispatcher.js';

export * from './dispatcher.js';
export * from './interactive.js';
export * from './headless.js';

export async function runCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const command = args[0] || 'context';

  switch (command) {
    case 'implement':
    case 'orchestrate': {
      const { runCliDispatcher } = await import('./dispatcher.js');
      const { ExecutionPlanner } = await import('../track/execution-planner.js');
      const { Engine } = await import('@superconductor/engine');
      const { readPlan } = await import('../track/index.js');
      
      let projectRoot = process.cwd();
      const subArgs = args.slice(1);
      for (let i = 0; i < subArgs.length; i++) {
        if (subArgs[i] === '--project-root') {
          if (i + 1 < subArgs.length && !subArgs[i + 1].startsWith('-')) {
            projectRoot = path.resolve(process.cwd(), subArgs[++i]);
          }
        } else if (subArgs[i].startsWith('--project-root=')) {
          projectRoot = path.resolve(process.cwd(), subArgs[i].slice('--project-root='.length));
        }
      }

      const result = await runCliDispatcher(subArgs);
      if (result && !result.cancelled) {
        let trackIds = result.sortedTrackIds || result.trackIds || [];
        
        const planData = await Promise.all(trackIds.map((id: string) => ExecutionPlanner.loadTrackData(projectRoot, id)));
        const planned = ExecutionPlanner.plan(planData);
        
        const nodes: Record<string, any> = {};
        const edges: { from: string; to: string }[] = [];
        
        console.log(`\n🚀 Orchestrating ${planned.length} tracks via Engine...`);
        
        planned.forEach(p => {
          const plan = readPlan(projectRoot, p.trackId);
          let lastTaskId: string | null = null;
          
          plan.forEach((task: any, i: number) => {
            const id = `${p.trackId}_task_${i}`;
            nodes[id] = {
              id,
              role: task.agent || 'processor',
              tier: task.tier ? parseInt(task.tier.replace(/[^0-9]/g, ''), 10) : 3,
              status: 'pending',
              prompt: task.title,
              contextFiles: [],
              dependsOn: []
            };
            
            if (lastTaskId) {
              edges.push({ from: lastTaskId, to: id });
            }
            lastTaskId = id;
          });
          
          p.dependencies.forEach(dep => {
            const planDep = readPlan(projectRoot, dep);
            if (planDep.length > 0 && plan.length > 0) {
              const fromId = `${dep}_task_${planDep.length - 1}`;
              const toId = `${p.trackId}_task_0`;
              edges.push({ from: fromId, to: toId });
            }
          });
        });

        const { TrackSplicer } = await import('../context/splicer.js');
        const splicer = new TrackSplicer(projectRoot);
        const payload = splicer.spliceTracks(planned.map(p => p.trackId));

        const engine = new Engine({ nodes, edges }, { commonContext: payload });
        await engine.execute();
      }
      break;
    }

    case 'context': {
      const isJson = args.includes('--json');
      const ctx = getAgentContext(process.cwd());
      if (isJson) {
        console.log(JSON.stringify(ctx, null, 2));
      } else {
        console.log(`✅ Superconductor Core Context v${ctx.schemaVersion}`);
        console.log(`   Project Root: ${ctx.projectRoot}`);
        console.log(`   Tool Registry: ${ctx.toolRegistryStatus}`);
        console.log(`   Active Track: ${ctx.activeTrackId || 'none'}`);
        console.log(`   Total Tracks: ${ctx.tracks.length}`);
      }
      break;
    }

    case 'track': {
      const subCommand = args[1] || 'status';
      if (subCommand === 'status') {
        const trackId = args[2];
        if (trackId) {
          const stats = getCompletionStats(process.cwd(), trackId);
          console.log(JSON.stringify(stats, null, 2));
        } else {
          const tracks = readTrackRegistry(process.cwd());
          console.log(JSON.stringify(tracks, null, 2));
        }
      }
      break;
    }

    case 'review': {
      const input = resolveReviewInput(args.slice(1), true);
      const preflight = runDeterministicPreflight(process.cwd());
      console.log(JSON.stringify({ input, preflight }, null, 2));
      break;
    }

    case 'setup': {
      const rawHome = process.env.SUPERCONDUCTOR_HOME || path.join(os.homedir(), '.superconductor');
      const homeDir = path.resolve(rawHome);
      const registryPath = path.join(homeDir, 'tool-registry.json');
      if (fs.existsSync(registryPath)) {
        console.log('✅ Superconductor machine setup verified');
      } else {
        console.log('⚠️ Machine setup not initialized');
      }
      break;
    }

    case 'intelligence': {
      const m = await import('../intelligence/index.js');
      await m.runPipeline(args.slice(1), process.cwd(), path.join(process.cwd(), 'superconductor'));
      break;
    }

    default:
      console.log(`Superconductor Universal CLI

Usage:
  npx superconductor context [--json]
  npx superconductor track status [<track_id>]
  npx superconductor review [--staged|--branch <b>|--pr <url>]
  npx superconductor setup [--reset-registry]
  npx superconductor intelligence [--brownfield] [--target <path>]
`);
      process.exit(1);
  }
}

// Auto-run if executed as main CLI binary
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
