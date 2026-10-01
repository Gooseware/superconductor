#!/usr/bin/env node

/**
 * Superconductor Swarm Architecture Scanner
 *
 * Multi-agent architecture scanning driver:
 * 1. Loads ArchitectureScanPartitioner to parse workspace intelligence artifacts.
 * 2. Partitions the codebase into balanced, non-overlapping clusters based on coupling and hotspots.
 * 3. Formats the scan manifest for parallel subagent dispatch (architecture-scan-manifest.json).
 * 4. Aggregates findings from parallel subagents into a unified JSON candidate report (architecture-candidates.json).
 * 5. Identifies Non-DRY duplicate logic & component reinvention, shallow modules (deletion test candidates),
 *    leaky seams & coupling clusters, and proposed Superconductor track suggestions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to resolve ArchitectureScanPartitioner from compiled core
async function loadPartitioner() {
  const possiblePaths = [
    path.resolve(__dirname, '../../../packages/superconductor-core/dist/intelligence/partitioner.js'),
    path.resolve(__dirname, '../../../../packages/superconductor-core/dist/intelligence/partitioner.js'),
    path.resolve(process.cwd(), 'packages/superconductor-core/dist/intelligence/partitioner.js'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const mod = await import(p);
      if (mod.ArchitectureScanPartitioner) {
        return mod;
      }
    }
  }

  throw new Error(
    `[swarm-scan] Could not locate compiled ArchitectureScanPartitioner in superconductor-core/dist.\n` +
    `Please run 'npm run build' inside packages/superconductor-core first.`
  );
}

// Simple CLI Argument Parser
function parseArgs(args) {
  const parsed = {
    projectRoot: process.cwd(),
    outputDir: undefined,
    outputManifest: undefined,
    outputCandidates: undefined,
    targetAgents: undefined,
    maxFilesPerPartition: undefined,
    manifestOnly: false,
    aggregateFiles: [],
    dryRun: false,
    json: false,
    partitionId: undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root' && args[i + 1]) {
      parsed.projectRoot = path.resolve(args[++i]);
    } else if ((arg === '--output-dir' || arg === '--intel-dir') && args[i + 1]) {
      parsed.outputDir = path.resolve(args[++i]);
    } else if (arg === '--output-manifest' && args[i + 1]) {
      parsed.outputManifest = path.resolve(args[++i]);
    } else if (arg === '--output-candidates' && args[i + 1]) {
      parsed.outputCandidates = path.resolve(args[++i]);
    } else if (arg === '--target-agents' && args[i + 1]) {
      parsed.targetAgents = parseInt(args[++i], 10);
    } else if (arg === '--max-files' && args[i + 1]) {
      parsed.maxFilesPerPartition = parseInt(args[++i], 10);
    } else if (arg === '--partition-id' && args[i + 1]) {
      parsed.partitionId = args[++i];
    } else if (arg === '--manifest-only') {
      parsed.manifestOnly = true;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--aggregate') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed.aggregateFiles.push(path.resolve(args[++i]));
      }
    }
  }

  // Default output paths if not specified
  const scDir = path.join(parsed.projectRoot, 'superconductor');
  if (!parsed.outputManifest) {
    parsed.outputManifest = fs.existsSync(scDir)
      ? path.join(scDir, 'architecture-scan-manifest.json')
      : path.join(parsed.projectRoot, 'architecture-scan-manifest.json');
  }
  if (!parsed.outputCandidates) {
    parsed.outputCandidates = fs.existsSync(scDir)
      ? path.join(scDir, 'architecture-candidates.json')
      : path.join(parsed.projectRoot, 'architecture-candidates.json');
  }

  return parsed;
}

export async function runSwarmScan(cliArgs = process.argv.slice(2)) {
  const options = parseArgs(cliArgs);
  const { ArchitectureScanPartitioner } = await loadPartitioner();
  const partitioner = new ArchitectureScanPartitioner();

  // Mode 1: Aggregate mode (aggregating subagent candidate findings)
  if (options.aggregateFiles.length > 0) {
    const rawFindings = [];
    for (const file of options.aggregateFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = JSON.parse(fs.readFileSync(file, 'utf8'));
          rawFindings.push(content);
        } catch (e) {
          console.error(`[swarm-scan] Warning: Failed to parse findings file ${file}:`, e.message);
        }
      } else {
        console.error(`[swarm-scan] Warning: Findings file not found: ${file}`);
      }
    }

    const report = partitioner.aggregateFindings(rawFindings, options.projectRoot);

    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(options.outputCandidates), { recursive: true });
      fs.writeFileSync(options.outputCandidates, JSON.stringify(report, null, 2), 'utf8');
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\n======================================================`);
      console.log(`🚀 Swarm Architecture Findings Aggregated`);
      console.log(`======================================================`);
      console.log(`Total Candidates:       ${report.metrics.totalCandidates}`);
      console.log(`- Non-DRY Duplications: ${report.metrics.nonDryCount}`);
      console.log(`- Shallow Modules:      ${report.metrics.shallowModuleCount}`);
      console.log(`- Leaky Seams:          ${report.metrics.leakySeamCount}`);
      console.log(`- High Coupling:        ${report.metrics.highCouplingCount}`);
      console.log(`Top Recommendation:     ${report.topRecommendationId || 'None'}`);
      console.log(options.dryRun ? `[DRY RUN] Would write candidates report to: ${options.outputCandidates}` : `Output Written To:      ${options.outputCandidates}`);
      console.log(`======================================================\n`);
    }

    return { report };
  }

  // Mode 2: Swarm Partitioning & Manifest Generation
  const partitionOptions = {
    projectRoot: options.projectRoot,
    outputDir: options.outputDir,
    targetAgents: options.targetAgents,
    maxFilesPerPartition: options.maxFilesPerPartition,
  };

  const partitions = await partitioner.partitionForSwarmScan(partitionOptions);
  const manifest = partitioner.formatScanManifest(partitions, options.projectRoot);

  if (!options.dryRun && (options.manifestOnly || options.outputManifest)) {
    fs.mkdirSync(path.dirname(options.outputManifest), { recursive: true });
    fs.writeFileSync(options.outputManifest, JSON.stringify(manifest, null, 2), 'utf8');
  }

  if (options.manifestOnly) {
    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(`\n======================================================`);
      console.log(`📋 Swarm Architecture Scan Manifest Generated`);
      console.log(`======================================================`);
      console.log(`Total Files Partitioned: ${manifest.totalFiles}`);
      console.log(`Total Partitions:        ${manifest.partitions.length}`);
      console.log(`Total Hotspots:          ${manifest.summary.totalHotspots}`);
      if (options.dryRun) {
        console.log(`Manifest File:           [DRY RUN] Would write to ${options.outputManifest}`);
      } else {
        console.log(`Manifest File:           ${options.outputManifest}`);
      }
      console.log(`------------------------------------------------------`);
      manifest.partitions.forEach((p) => {
        console.log(`[${p.id}] ${p.name} (${p.domain})`);
        console.log(`       Files: ${p.files.length} | Complexity: ${p.complexityScore} | Hotspots: ${p.hotspots.length}`);
        console.log(`       Agent: ${p.suggestedAgentRole}`);
      });
      console.log(`======================================================\n`);
    }
    return { manifest, partitions };
  }

  // Mode 3: Full Scan (Partition + Candidate Heuristics + Synthesis Report)
  const candidates = await partitioner.detectCandidates(partitions, partitionOptions);
  const report = partitioner.aggregateFindings([candidates], options.projectRoot);

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(options.outputManifest), { recursive: true });
    fs.writeFileSync(options.outputManifest, JSON.stringify(manifest, null, 2), 'utf8');

    fs.mkdirSync(path.dirname(options.outputCandidates), { recursive: true });
    fs.writeFileSync(options.outputCandidates, JSON.stringify(report, null, 2), 'utf8');
  }

  if (options.json) {
    console.log(JSON.stringify({ manifest, report }, null, 2));
  } else {
    console.log(`\n======================================================`);
    console.log(`🔍 Superconductor Swarm Architecture Scan Complete`);
    console.log(`======================================================`);
    console.log(`Codebase Files Partitioned: ${manifest.totalFiles} across ${manifest.partitions.length} disjoint partitions.`);
    if (options.dryRun) {
      console.log(`[DRY RUN] Would write scan manifest to:   ${options.outputManifest}`);
    } else {
      console.log(`Scan Manifest Written:      ${options.outputManifest}`);
    }
    console.log(`------------------------------------------------------`);
    console.log(`Architectural Candidates Discovered: ${report.metrics.totalCandidates}`);
    console.log(`  • Non-DRY Duplications:   ${report.metrics.nonDryCount}`);
    console.log(`  • Shallow Modules:        ${report.metrics.shallowModuleCount}`);
    console.log(`  • Leaky Seams / Coupling: ${report.metrics.leakySeamCount + report.metrics.highCouplingCount}`);
    console.log(`------------------------------------------------------`);

    report.candidates.forEach((cand, idx) => {
      console.log(`\n[#${idx + 1}] [${cand.type}] ${cand.title} [${cand.recommendationStrength}]`);
      console.log(`     ${cand.description}`);
      console.log(`     Affected Files: ${cand.files.join(', ')}`);
      console.log(`     Proposed Track: ${cand.proposedTrack.trackId} - "${cand.proposedTrack.title}"`);
    });

    console.log(`\n======================================================`);
    if (options.dryRun) {
      console.log(`[DRY RUN] Would write candidates report to: ${options.outputCandidates}`);
    } else {
      console.log(`Candidates Report Written:  ${options.outputCandidates}`);
    }
    console.log(`Ready for Astryx Interactive Report & Checkbox Track Dispatch.`);
    console.log(`======================================================\n`);
  }

  return { manifest, partitions, candidates, report };
}

// Direct CLI invocation check
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  runSwarmScan().catch((err) => {
    console.error(`[swarm-scan] Fatal Error:`, err);
    process.exit(1);
  });
}
