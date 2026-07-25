#!/usr/bin/env npx tsx
import { ArchiveManager } from './src/track/archive-manager.js';
import * as process from 'node:process';
import * as path from 'node:path';

async function run() {
  const trackId = process.argv[2];
  if (!trackId) {
    console.error('Usage: archive-track <track_id>');
    process.exit(1);
  }

  // Assuming project root is where this script is called from or the parent of packages/superconductor-core
  const projectRoot = process.env.SUPERCONDUCTOR_ROOT || path.resolve(process.cwd());
  const manager = new ArchiveManager({ projectRoot });

  try {
    await manager.archiveTrack(trackId);
    console.log(`Successfully archived track ${trackId}`);
  } catch (err: any) {
    console.error(`Failed to archive track: ${err.message}`);
    process.exit(1);
  }
}

run();
