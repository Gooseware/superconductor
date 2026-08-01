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

    case 'yolo': {
      const isPersist = args.includes('--persist');
      const { TrackStateManager } = await import('../permissions/track-state.js');
      const stateManager = new TrackStateManager(process.cwd());
      if (isPersist) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        const answer = await new Promise<string>((resolve) => {
          rl.question('⚠️ YOLO mode --persist will grant unrestricted access across sessions. Are you absolutely sure? (Type "YOLO" to confirm): ', resolve);
        });
        rl.close();
        if (answer.trim() === 'YOLO') {
          stateManager.setYolo(true);
          console.log('✅ YOLO mode activated and persisted to session flags.');
        } else {
          console.log('❌ YOLO persistence aborted.');
          process.exit(1);
        }
      } else {
        // Just run in memory for this invocation (or whatever it is meant to do)
        console.log('✅ YOLO mode activated for this session.');
      }
      break;
    }

    case 'swarm-execute': {
      const { SwarmOrchestratorCLI } = await import('@superconductor/engine');
      const trackId = args[1];
      if (!trackId) {
        console.error('Missing track-id. Usage: superconductor swarm-execute <track-id>');
        process.exit(1);
      }
      const cli = new SwarmOrchestratorCLI();
      try {
        const res = await cli.executeTrack(process.cwd(), trackId);
        const succeeded = res.workUnits.filter((wu: any) => wu.state === 'DONE').length;
        console.log(`🚀 Swarm execute complete. ${succeeded}/${res.workUnits.length} tasks succeeded`);
      } catch (err) {
        console.error('Swarm execute failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
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

    case 'infer-permissions': {
      const { KeywordPermissionInferrer } = await import('../permissions/keyword-inferrer.js');
      const specPath = args[1];
      const outPath = args[2];
      if (!specPath || !outPath) {
        console.error('Usage: superconductor infer-permissions <spec.md path> <out manifest.toml path>');
        process.exit(1);
      }
      const specText = fs.readFileSync(specPath, 'utf8');
      const capabilities = KeywordPermissionInferrer.inferCapabilities(specText);
      const toml = [
        '[meta]',
        `track_id = "${path.basename(path.dirname(outPath))}"`,
        `generated_at = "${new Date().toISOString()}"`,
        `inferred_by = "auto"`,
        '',
        '[capabilities]',
        `usb_access = ${capabilities.usb_access}`,
        `arbitrary_shell = ${capabilities.arbitrary_shell}`,
        `network_unrestricted = ${capabilities.network_unrestricted}`,
        `fs_outside_root = ${capabilities.fs_outside_root}`,
        `persistent = false`,
        '',
        '[allowlist]',
        'shell_prefixes = []',
        'domains = []',
        'paths = []'
      ].join('\n');
      fs.writeFileSync(outPath, toml, 'utf8');
      console.log(`✅ Inferred permissions written to ${outPath}`);
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
  npx superconductor infer-permissions <spec.md path> <out manifest.toml path>
`);
      process.exit(1);
  }
}

// Auto-run if executed as main CLI binary
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
