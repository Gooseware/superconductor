/**
 * CLI Command Handler: /superconductor:learn
 *
 * Implements inspection, vetting, harvesting, promotion, and discarding
 * of continuous learning candidate skills.
 *
 * Invariant: CLI learn subcommands (--list, --inspect, --promote, --discard, --harvest)
 * MUST handle non-interactive flags gracefully.
 */

import fs from 'fs/promises';
import path from 'path';
import {
  SkillIncubationManager,
  SkillPromoter,
  TrajectoryHarvester,
  WorkflowSkillDistiller,
  SkillDogmaValidator,
  CanaryHarness,
  VettingStatus,
} from '../learning/index.js';

interface ParsedLearnArgs {
  subcommand?: 'list' | 'inspect' | 'promote' | 'discard' | 'harvest' | 'help';
  targetSkill?: string;
  trackId?: string;
  scope?: string;
  json: boolean;
  projectRoot?: string;
  stagingDir?: string;
  globalSkillsDir?: string;
  unknownArgs: string[];
}

function parseArgs(args: string[] = [], options?: Record<string, unknown>): ParsedLearnArgs {
  const result: ParsedLearnArgs = {
    json: Boolean(options?.json),
    projectRoot: options?.projectRoot as string | undefined,
    stagingDir: options?.stagingDir as string | undefined,
    globalSkillsDir: (options?.globalSkillsDir || options?.globalDir) as string | undefined,
    scope: options?.scope as string | undefined,
    unknownArgs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.subcommand = 'help';
      continue;
    }

    if (arg === '--json') {
      result.json = true;
      continue;
    }

    if (arg === '--list' || arg === 'list') {
      result.subcommand = 'list';
      continue;
    }

    if (arg === '--inspect' || arg === 'inspect') {
      result.subcommand = 'inspect';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.targetSkill = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--inspect=')) {
      result.subcommand = 'inspect';
      result.targetSkill = arg.slice('--inspect='.length);
      continue;
    }

    if (arg === '--promote' || arg === 'promote') {
      result.subcommand = 'promote';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.targetSkill = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--promote=')) {
      result.subcommand = 'promote';
      result.targetSkill = arg.slice('--promote='.length);
      continue;
    }

    if (arg === '--discard' || arg === 'discard') {
      result.subcommand = 'discard';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.targetSkill = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--discard=')) {
      result.subcommand = 'discard';
      result.targetSkill = arg.slice('--discard='.length);
      continue;
    }

    if (arg === '--harvest' || arg === 'harvest') {
      result.subcommand = 'harvest';
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.trackId = args[++i];
      }
      continue;
    }

    if (arg === '--track') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.trackId = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--track=')) {
      result.trackId = arg.slice('--track='.length);
      continue;
    }

    if (arg === '--scope') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.scope = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--scope=')) {
      result.scope = arg.slice('--scope='.length);
      continue;
    }

    if (arg === '--project-root') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.projectRoot = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--project-root=')) {
      result.projectRoot = arg.slice('--project-root='.length);
      continue;
    }

    if (arg === '--staging-dir') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.stagingDir = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--staging-dir=')) {
      result.stagingDir = arg.slice('--staging-dir='.length);
      continue;
    }

    if (arg === '--global-skills-dir') {
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.globalSkillsDir = args[++i];
      }
      continue;
    }
    if (arg.startsWith('--global-skills-dir=')) {
      result.globalSkillsDir = arg.slice('--global-skills-dir='.length);
      continue;
    }

    // Positional target skill if a subcommand expecting one was set without it
    if ((result.subcommand === 'inspect' || result.subcommand === 'promote' || result.subcommand === 'discard') && !result.targetSkill && !arg.startsWith('-')) {
      result.targetSkill = arg;
      continue;
    }

    result.unknownArgs.push(arg);
  }

  return result;
}

function printUsage(): void {
  console.log(`Superconductor Continuous Learning Engine (/superconductor:learn)

Usage:
  superconductor learn --list [--json]
  superconductor learn --inspect <skill> [--json]
  superconductor learn --promote <skill> [--scope project|global] [--json]
  superconductor learn --discard <skill> [--json]
  superconductor learn --harvest [--track <id>] [--json]

Subcommands & Flags:
  --list                    List all incubating skills with confidence, status, source
  --inspect <skill>         Print candidate SKILL.md and vetting report
  --promote <skill>         Promote vetted skill to project or global scope
  --scope <project|global>  Promotion destination scope (default: project)
  --discard <skill>         Discard incubating skill from staging
  --harvest                 Harvest trajectory from completed track and distill skill
  --track <id>              Target track ID for harvesting
  --json                    Output structured JSON
  --help, -h                Show this help message
`);
}

export async function learnCommand(
  args: string[] = [],
  options?: Record<string, unknown>
): Promise<number> {
  const parsed = parseArgs(args, options);
  const isJson = parsed.json;
  const projectRoot = parsed.projectRoot || process.env.SUPERCONDUCTOR_ROOT || process.cwd();
  const stagingDir = parsed.stagingDir;
  const globalSkillsDir = parsed.globalSkillsDir;

  if (parsed.unknownArgs.length > 0) {
    const errMsg = `Error: Unknown subcommand or flag: ${parsed.unknownArgs.join(' ')}`;
    if (isJson) {
      console.error(JSON.stringify({ error: errMsg }, null, 2));
    } else {
      console.error(errMsg);
    }
    return 1;
  }

  if (!parsed.subcommand || parsed.subcommand === 'help') {
    printUsage();
    return 0;
  }

  try {
    switch (parsed.subcommand) {
      case 'list': {
        const skills = await SkillIncubationManager.listIncubating({
          projectRoot,
          stagingDir,
        });

        if (isJson) {
          console.log(JSON.stringify(skills, null, 2));
          return 0;
        }

        if (skills.length === 0) {
          console.log('No incubating skills found in staging.');
          return 0;
        }

        console.log(`\nIncubating Skills (${skills.length}):`);
        console.log('--------------------------------------------------------------------------------');
        console.log(
          'NAME'.padEnd(25) +
          'STATUS'.padEnd(12) +
          'CONFIDENCE'.padEnd(14) +
          'SOURCE TRACK'
        );
        console.log('--------------------------------------------------------------------------------');
        for (const s of skills) {
          const name = s.name.padEnd(25);
          const status = s.vettingStatus.padEnd(12);
          const conf = (
            typeof s.confidenceScore === 'number'
              ? s.confidenceScore.toFixed(2)
              : 'N/A'
          ).padEnd(14);
          const source = s.sourceTrack || 'unknown';
          console.log(`${name}${status}${conf}${source}`);
        }
        console.log('--------------------------------------------------------------------------------\n');
        return 0;
      }

      case 'inspect': {
        if (!parsed.targetSkill) {
          const errMsg = 'Error: Missing skill name for --inspect.';
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        const skill = await SkillIncubationManager.getIncubatingSkill(parsed.targetSkill, {
          projectRoot,
          stagingDir,
        });

        if (!skill) {
          const errMsg = `Error: Skill "${parsed.targetSkill}" not found in incubation staging.`;
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        if (isJson) {
          console.log(JSON.stringify(skill, null, 2));
          return 0;
        }

        console.log('================================================================================');
        console.log(`SKILL: ${skill.name}`);
        console.log(`Vetting Status: ${skill.vettingStatus}`);
        console.log(
          `Confidence Score: ${
            typeof skill.confidenceScore === 'number'
              ? skill.confidenceScore.toFixed(2)
              : 'N/A'
          }`
        );
        console.log(`Source Track: ${skill.sourceTrack || 'unknown'}`);
        console.log(`Path: ${skill.filePath}`);
        console.log('================================================================================');
        console.log('\n--- SKILL.md Content ---\n');
        console.log(skill.content);
        console.log('\n--- Vetting Report ---\n');
        console.log(
          JSON.stringify(
            skill.vettingReport ?? { status: skill.vettingStatus },
            null,
            2
          )
        );
        return 0;
      }

      case 'promote': {
        if (!parsed.targetSkill) {
          const errMsg = 'Error: Missing skill name for --promote.';
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        const scope = (parsed.scope || 'project') as 'project' | 'global';
        if (scope !== 'project' && scope !== 'global') {
          const errMsg = `Error: Invalid scope "${parsed.scope}". Scope must be "project" or "global".`;
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        const result = await SkillPromoter.promoteSkill(parsed.targetSkill, {
          projectRoot,
          stagingDir,
          globalSkillsDir,
          scope,
        });

        if (!result.success) {
          const errMsg = `Error: ${result.error || result.reason || 'Promotion failed.'}`;
          if (isJson) {
            console.error(JSON.stringify(result, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        if (isJson) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            `✅ Promoted skill "${parsed.targetSkill}" to ${scope} scope at ${result.targetPath}`
          );
        }
        return 0;
      }

      case 'discard': {
        if (!parsed.targetSkill) {
          const errMsg = 'Error: Missing skill name for --discard.';
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        const existing = await SkillIncubationManager.getIncubatingSkill(parsed.targetSkill, {
          projectRoot,
          stagingDir,
        });

        if (!existing) {
          const errMsg = `Error: Skill "${parsed.targetSkill}" not found in incubation staging.`;
          if (isJson) {
            console.error(
              JSON.stringify(
                { success: false, skill: parsed.targetSkill, error: errMsg },
                null,
                2
              )
            );
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        const success = await SkillIncubationManager.discardSkill(parsed.targetSkill, {
          projectRoot,
          stagingDir,
        });

        if (!success) {
          const errMsg = `Error: Failed to discard skill "${parsed.targetSkill}".`;
          if (isJson) {
            console.error(
              JSON.stringify(
                { success: false, skill: parsed.targetSkill, error: errMsg },
                null,
                2
              )
            );
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        if (isJson) {
          console.log(
            JSON.stringify(
              { success: true, skill: parsed.targetSkill, action: 'discard' },
              null,
              2
            )
          );
        } else {
          console.log(`✅ Discarded incubating skill "${parsed.targetSkill}".`);
        }
        return 0;
      }

      case 'harvest': {
        let resolvedTrackPath: string | null = null;

        if (parsed.trackId) {
          const candidates = [
            path.resolve(parsed.trackId),
            path.resolve(projectRoot, parsed.trackId),
            path.resolve(projectRoot, 'superconductor', 'tracks', parsed.trackId),
          ];
          for (const cand of candidates) {
            try {
              const stat = await fs.stat(cand);
              if (stat.isDirectory()) {
                resolvedTrackPath = cand;
                break;
              }
            } catch {
              // try next
            }
          }
        } else {
          const tracksDir = path.resolve(projectRoot, 'superconductor', 'tracks');
          try {
            const entries = await fs.readdir(tracksDir, { withFileTypes: true });
            const trackDirs = entries
              .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
              .map((e) => path.join(tracksDir, e.name));

            if (trackDirs.length > 0) {
              resolvedTrackPath = trackDirs[trackDirs.length - 1];
            }
          } catch {
            try {
              await fs.stat(path.join(projectRoot, 'plan.md'));
              resolvedTrackPath = projectRoot;
            } catch {
              // none
            }
          }
        }

        if (!resolvedTrackPath) {
          const errMsg = parsed.trackId
            ? `Error: Track path not found for "${parsed.trackId}".`
            : 'Error: No track specified and no tracks found to harvest.';
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        // 1. Harvest track trajectory
        const record = await TrajectoryHarvester.harvestTrack(resolvedTrackPath);
        if (!record) {
          const errMsg = `Error: Failed to harvest trajectory from track "${path.basename(resolvedTrackPath)}".`;
          if (isJson) {
            console.error(JSON.stringify({ error: errMsg }, null, 2));
          } else {
            console.error(errMsg);
          }
          return 1;
        }

        // 2. Distill workflow into candidate skill
        const distilled = WorkflowSkillDistiller.distillFromExperience(record, {
          allowTrivial: true,
        });

        if (!distilled) {
          if (isJson) {
            console.log(
              JSON.stringify(
                {
                  success: true,
                  harvested: true,
                  distilled: false,
                  track: path.basename(resolvedTrackPath),
                  message: 'No reusable workflow met distillation criteria.',
                },
                null,
                2
              )
            );
          } else {
            console.log(
              `ℹ️ Trajectory harvested from "${path.basename(
                resolvedTrackPath
              )}", but no workflow met distillation criteria.`
            );
          }
          return 0;
        }

        // 3. Automated Vetting Gate (Dogma validation + Canary evaluation)
        const dogmaReport = SkillDogmaValidator.validate(distilled.content || '');
        const canaryReport = await CanaryHarness.evaluateSkill(distilled);

        let vettingStatus: VettingStatus;
        if (!dogmaReport.valid || dogmaReport.status === 'rejected' || !canaryReport.passed) {
          vettingStatus = 'rejected';
        } else if (
          dogmaReport.status === 'flagged' ||
          (canaryReport.warnings && canaryReport.warnings.length > 0)
        ) {
          vettingStatus = 'flagged';
        } else {
          vettingStatus = 'passed';
        }

        const vettingReport = {
          dogma: dogmaReport,
          canary: canaryReport,
        };

        // 4. Stage distilled candidate
        const stagedPath = await SkillIncubationManager.stageSkill(
          {
            ...distilled,
            learningMetadata: {
              status: 'incubating',
              source_track: path.basename(resolvedTrackPath),
              harvest_timestamp: new Date().toISOString(),
              confidence_score: distilled.confidenceScore ?? 0.85,
              vetting_status: vettingStatus,
              vetting_report: vettingReport,
            },
          },
          { projectRoot, stagingDir }
        );

        if (isJson) {
          console.log(
            JSON.stringify(
              {
                success: true,
                harvested: true,
                distilled: true,
                skill: distilled.name,
                path: stagedPath,
                vettingStatus,
                confidenceScore: distilled.confidenceScore,
              },
              null,
              2
            )
          );
        } else {
          console.log(
            `✅ Harvested and distilled skill "${distilled.name}" from track "${path.basename(
              resolvedTrackPath
            )}"`
          );
          console.log(`   Staged at: ${stagedPath}`);
          console.log(
            `   Vetting Status: ${vettingStatus} (confidence: ${
              distilled.confidenceScore?.toFixed(2) ?? 'N/A'
            })`
          );
        }
        return 0;
      }

      default: {
        printUsage();
        return 0;
      }
    }
  } catch (err) {
    const errMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
    if (isJson) {
      console.error(JSON.stringify({ error: errMsg }, null, 2));
    } else {
      console.error(errMsg);
    }
    return 1;
  }
}
