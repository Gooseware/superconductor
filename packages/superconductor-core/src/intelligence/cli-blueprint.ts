#!/usr/bin/env node
/**
 * cli-blueprint.ts — Swarm Blueprint generation CLI wrapper
 *
 * Accepts a plan.md path as argument.
 * Preflights with IntelligencePreflightCheck.run() to inspect intelligence subsystem.
 * Invokes SwarmBlueprintGenerator to produce the blueprint and annotate the plan in place.
 * Emits JSON summary to stdout for parsing by skills.
 * Any errors are logged to stderr and exit with code 1.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { IntelligencePreflightCheck } from './preflight-check.js';
import { SwarmBlueprintGenerator, SwarmBlueprint } from './swarm-blueprint-generator.js';
import { resolveProjectRoot } from './utils/resolve-project-root.js';

export interface BlueprintCliSummary {
  track_id: string;
  waves: number;
  oracleCadence: number;
  costSummary: string;
  estimatedTasks: number;
  source: 'intelligence' | 'keyword_heuristics';
}

export interface GenerateBlueprintCliOptions {
  projectRoot?: string;
  outputDir?: string;
  maxConcurrent?: number;
  silentPreflight?: boolean;
}

export interface GenerateBlueprintResult {
  summary: BlueprintCliSummary;
  annotatedPlan: string;
  blueprint: SwarmBlueprint;
}

/**
 * Extracts track_id from plan.md markdown content or file path.
 */
export function extractTrackId(planMarkdown: string, planPath: string): string {
  // 1. Explicit Track ID metadata
  const trackIdMatch = planMarkdown.match(/\*\*Track\s+ID:\*\*\s*`?([a-zA-Z0-9_\-]+)`?/i);
  if (trackIdMatch && trackIdMatch[1]) {
    return trackIdMatch[1].trim();
  }

  // 2. Implementation Plan header with slug: # Implementation Plan: `track_id`
  const headerMatch = planMarkdown.match(/^#\s+Implementation Plan:\s*`?([a-zA-Z0-9_\-]+)`?/im);
  if (headerMatch && headerMatch[1]) {
    return headerMatch[1].trim();
  }

  // 3. Fenced JSON metadata block: "track_id": "..."
  const jsonTrackMatch = planMarkdown.match(/"track_id":\s*"([^"]+)"/);
  if (jsonTrackMatch && jsonTrackMatch[1]) {
    return jsonTrackMatch[1].trim();
  }

  // 4. Fallback to enclosing directory name if inside a tracks/ or archive/ directory
  try {
    const abs = path.resolve(planPath);
    const parentDir = path.basename(path.dirname(abs));
    const grandParentDir = path.basename(path.dirname(path.dirname(abs)));
    if (grandParentDir === 'tracks' || grandParentDir === 'archive') {
      return parentDir;
    }
  } catch {
    // ignore
  }

  return 'unknown';
}

/**
 * Injects or updates the ## Swarm Blueprint section in plan markdown.
 */
export function injectBlueprintSection(planMarkdown: string, blueprintSection: string): string {
  // If a ## Swarm Blueprint section already exists, replace it cleanly
  const blueprintRegex = /## Swarm Blueprint\b[\s\S]*?(?=(\n## Phase|\n---\s*\n\s*## Phase|$))/;
  if (blueprintRegex.test(planMarkdown)) {
    return planMarkdown.replace(blueprintRegex, `${blueprintSection.trim()}\n\n`);
  }

  // Otherwise, insert before the first ## Phase
  const firstPhaseIdx = planMarkdown.search(/^##\s+Phase/m);
  if (firstPhaseIdx !== -1) {
    const before = planMarkdown.slice(0, firstPhaseIdx);
    const after = planMarkdown.slice(firstPhaseIdx);
    const trimmedBefore = before.trimEnd();
    if (trimmedBefore.endsWith('---')) {
      return `${trimmedBefore}\n\n${blueprintSection.trim()}\n\n---\n\n${after}`;
    }
    return `${trimmedBefore}\n\n---\n\n${blueprintSection.trim()}\n\n---\n\n${after}`;
  }

  // Fallback: append at the end
  return `${planMarkdown.trimEnd()}\n\n---\n\n${blueprintSection.trim()}\n`;
}

/**
 * Runs preflight, generates blueprint, annotates plan, and writes to disk.
 */
export async function runCliBlueprint(
  planPath: string,
  options?: GenerateBlueprintCliOptions
): Promise<GenerateBlueprintResult> {
  if (!planPath) {
    throw new Error('Missing plan.md path argument. Usage: node dist/intelligence/cli-blueprint.js <plan.md_path>');
  }

  const absPlanPath = path.resolve(process.cwd(), planPath);
  if (!fs.existsSync(absPlanPath)) {
    throw new Error(`Plan file not found: ${absPlanPath}`);
  }

  // Preflight check
  const projectRoot = options?.projectRoot ?? resolveProjectRoot(path.dirname(absPlanPath));
  const outputDir = options?.outputDir ?? path.join(projectRoot, 'superconductor', 'intelligence');

  const preflight = IntelligencePreflightCheck.run(projectRoot, outputDir);
  if (!options?.silentPreflight && preflight.formattedBanner) {
    process.stderr.write(preflight.formattedBanner + '\n');
  }

  const planMarkdown = fs.readFileSync(absPlanPath, 'utf8');

  // Generate blueprint
  const blueprint = SwarmBlueprintGenerator.generate(planMarkdown, {
    outputDir: preflight.isMismatch ? undefined : outputDir,
    projectRoot,
    maxConcurrent: options?.maxConcurrent ?? 6,
  });

  // Annotate tasks with TCS and tier
  const annotatedMarkdown = SwarmBlueprintGenerator.annotatePlan(planMarkdown, blueprint);

  // Inject ## Swarm Blueprint section
  const blueprintSection = SwarmBlueprintGenerator.formatBlueprintSection(blueprint);
  const finalPlanMarkdown = injectBlueprintSection(annotatedMarkdown, blueprintSection);

  // Write annotated plan in place
  fs.writeFileSync(absPlanPath, finalPlanMarkdown, 'utf8');

  const trackId = extractTrackId(planMarkdown, absPlanPath);
  const costSummary = typeof blueprint.budget?.estimatedCostUSD === 'number'
    ? `$${blueprint.budget.estimatedCostUSD.toFixed(2)}`
    : blueprint.costSummary;

  const summary: BlueprintCliSummary = {
    track_id: trackId,
    waves: blueprint.waves.waves.length,
    oracleCadence: blueprint.oracleCadence,
    costSummary,
    estimatedTasks: blueprint.waves.totalTasks,
    source: blueprint.repoContextSource === 'intelligence' ? 'intelligence' : 'keyword_heuristics',
  };

  return {
    summary,
    annotatedPlan: finalPlanMarkdown,
    blueprint,
  };
}

/**
 * Determines whether this file is executed directly as a script.
 */
export function isDirectExecution(argv1 = process.argv[1], metaUrl = import.meta.url): boolean {
  if (!argv1) return false;
  try {
    const scriptPath = fs.realpathSync(path.resolve(argv1));
    const modulePath = fs.realpathSync(fileURLToPath(metaUrl));
    return scriptPath === modulePath;
  } catch {
    return path.resolve(argv1) === fileURLToPath(metaUrl);
  }
}

/**
 * CLI Entry point
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<BlueprintCliSummary> {
  const planPath = args[0];
  if (!planPath) {
    process.stderr.write('Usage: node dist/intelligence/cli-blueprint.js <plan.md_path>\n');
    process.exit(1);
  }

  try {
    const { summary } = await runCliBlueprint(planPath);
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } catch (err: any) {
    process.stderr.write(`[superconductor:blueprint] ERROR: ${err.message || String(err)}\n`);
    process.exit(1);
  }
}

if (isDirectExecution()) {
  main().catch((err: any) => {
    process.stderr.write(`[superconductor:blueprint] ERROR: ${err.message || String(err)}\n`);
    process.exit(1);
  });
}
