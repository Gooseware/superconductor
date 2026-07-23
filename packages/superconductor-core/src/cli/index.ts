import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getAgentContext } from '../protocol/agent-context.js';
import { readTrackRegistry, getCompletionStats } from '../track/index.js';
import { runDeterministicPreflight } from '../review/deterministic-preflight.js';
import { resolveReviewInput } from '../review/input-resolution.js';

export function runCli(args: string[] = process.argv.slice(2)): void {
  const command = args[0] || 'context';

  switch (command) {
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
      console.log('✅ Intelligence layer runner delegated to @superconductor/core');
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
  runCli();
}
