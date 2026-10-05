import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import prompts from 'prompts';
import { ArchiveManager } from '../track/archive-manager.js';
import { SignOffGate } from './sign-off-gate.js';
import {
  BlastRadiusAnalyzer,
  BlastRadiusReport,
} from '../planning/blast-radius-analyzer.js';

export type ExecutionMode = 'interactive' | 'headless';
export type FinalizationAction = 'oracle-review' | 'user-approval' | 'merge' | 'archive' | 'delete' | 'skip';

export interface BlastRadiusSectionResult {
  markdown: string;
  report: BlastRadiusReport;
  planTasks: string[];
}

export interface TrackLifecycleWizardOptions {
  projectRoot?: string;
  tracksRegistryPath?: string;
  archiveRegistryPath?: string;
  tracksDir?: string;
  archiveDir?: string;
  promptFn?: (prompt: any) => Promise<any>;
  gitExecFn?: (cmd: string, args: string[]) => string;
  archiveManager?: ArchiveManager;
  stateStore?: any;
  logger?: { log: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void };
}

export interface FinalizationOptions {
  trackId: string;
  action: FinalizationAction;
  targetBranch?: string; // default 'main'
  trackBranch?: string;
  oracleSignOff?: boolean;
  userApproved?: boolean;
  executionMode?: ExecutionMode;
  reviewerConvIds?: string[];
  force?: boolean;
}

export interface FinalizationResult {
  trackId: string;
  action: FinalizationAction;
  success: boolean;
  message: string;
  mergedCommitSha?: string;
  archivedPath?: string;
  deleted?: boolean;
}

export class TrackLifecycleWizard {
  private projectRoot: string;
  private tracksRegistryPath: string;
  private archiveRegistryPath: string;
  private tracksDir: string;
  private archiveDir: string;
  private promptFn: (prompt: any) => Promise<any>;
  private gitExecFn: (cmd: string, args: string[]) => string;
  private archiveManager?: ArchiveManager;
  private stateStore?: any;
  private logger: { log: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void };

  constructor(options: TrackLifecycleWizardOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.tracksRegistryPath =
      options.tracksRegistryPath || path.join(this.projectRoot, 'superconductor', 'tracks.md');
    this.archiveRegistryPath =
      options.archiveRegistryPath || path.join(this.projectRoot, 'superconductor', 'archive.md');
    this.tracksDir = options.tracksDir || path.join(this.projectRoot, 'superconductor', 'tracks');
    this.archiveDir = options.archiveDir || path.join(this.projectRoot, 'superconductor', 'tracks', 'archive');
    this.promptFn = options.promptFn || prompts;
    this.gitExecFn =
      options.gitExecFn ||
      ((cmd: string, args: string[]) => {
        return child_process.execFileSync(cmd, args, { encoding: 'utf8', cwd: this.projectRoot });
      });
    this.archiveManager =
      options.archiveManager ||
      new ArchiveManager({ projectRoot: this.projectRoot });
    this.stateStore = options.stateStore;
    this.logger = options.logger || console;
  }

  /**
   * Generates prompt question for Execution Mode selection.
   */
  public buildExecutionModePrompt(): any {
    return {
      type: 'select',
      name: 'executionMode',
      message: 'Select Track Execution Mode:',
      choices: [
        {
          title: 'Interactive Mode',
          value: 'interactive',
          description: 'Step-by-step confirmation, manual review checkpoints, interactive dialogs',
        },
        {
          title: 'Headless Mode',
          value: 'headless',
          description: 'Automated unattended execution, auto-advance tasks, CI/CD automated gates',
        },
      ],
      initial: 0,
    };
  }

  /**
   * Generates prompt question for Target Branch selection.
   */
  public buildTargetBranchPrompt(defaultBranch = 'main'): any {
    return {
      type: 'select',
      name: 'targetBranch',
      message: 'Select Target Integration Branch:',
      choices: [
        {
          title: `main (default)`,
          value: 'main',
          description: 'Primary production integration branch',
        },
        {
          title: 'dev',
          value: 'dev',
          description: 'Development trunk branch',
        },
        {
          title: 'release',
          value: 'release',
          description: 'Release preparation branch',
        },
      ],
      initial: defaultBranch === 'main' ? 0 : 1,
    };
  }

  /**
   * Generates prompt question for Finalization Action.
   */
  public buildFinalizationPrompt(trackId: string, trackDescription = ''): any {
    return {
      type: 'select',
      name: 'action',
      message: `Track '${trackDescription || trackId}' is complete. Choose finalization action:`,
      choices: [
        {
          title: 'Merge',
          value: 'merge',
          description: 'Merge track branch into target branch (Requires Oracle sign-off)',
        },
        {
          title: 'Archive',
          value: 'archive',
          description: `Move track to superconductor/archive/${trackId}`,
        },
        {
          title: 'Delete',
          value: 'delete',
          description: 'Permanently delete track directory and remove registry entry',
        },
        {
          title: 'Skip',
          value: 'skip',
          description: 'Keep track in registry and skip cleanup',
        },
      ],
      initial: 0,
    };
  }

  /**
   * Checks if Oracle has signed off on the track.
   */
  public async checkOracleSignOff(trackId: string, sessionId?: string): Promise<boolean> {
    try {
      const approved = await SignOffGate.isApproved(trackId, sessionId || 'default', this.stateStore);
      if (approved) return true;
    } catch {}

    const signoffPath = path.join(this.projectRoot, 'superconductor', 'quorum', `signoff_${trackId}.json`);
    if (fs.existsSync(signoffPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(signoffPath, 'utf8'));
        if (data && (data.approved_by || data.sign_key || data.oracle_conv_id)) {
          return true;
        }
      } catch {}
    }

    return false;
  }

  /**
   * Executes track finalization based on the specified action.
   */
  public async finalizeTrack(options: FinalizationOptions): Promise<FinalizationResult> {
    const { trackId, action, force = false } = options;
    const targetBranch = options.targetBranch || 'main';
    const trackBranch = options.trackBranch || `track/${trackId}`;

    if (!/^[a-zA-Z0-9_-]+$/.test(trackId)) {
      throw new Error(`Invalid track ID: ${trackId}`);
    }

    // Oracle Sign-Off Gate Check
    const hasOracleSignOff = options.oracleSignOff ?? (await this.checkOracleSignOff(trackId));

    if (action === 'merge') {
      if (!hasOracleSignOff && !force) {
        return {
          trackId,
          action,
          success: false,
          message: `Oracle sign-off required before merge. Quorum and Oracle verification must pass.`,
        };
      }

      this.logger.log(`[TrackLifecycleWizard] Merging ${trackBranch} into ${targetBranch}...`);
      try {
        const currentBranch = this.gitExecFn('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        if (currentBranch !== targetBranch) {
          this.gitExecFn('git', ['checkout', targetBranch]);
        }

        const mergeMsg = `feat(superconductor): Merge track '${trackId}' into ${targetBranch}`;
        this.gitExecFn('git', ['merge', '--no-ff', trackBranch, '-m', mergeMsg]);
        const mergeCommitSha = this.gitExecFn('git', ['rev-parse', '--short', 'HEAD']).trim();

        return {
          trackId,
          action,
          success: true,
          message: `Successfully merged ${trackBranch} into ${targetBranch}`,
          mergedCommitSha: mergeCommitSha || 'merged',
        };
      } catch (err: any) {
        return {
          trackId,
          action,
          success: false,
          message: `Merge failed: ${err.message}`,
        };
      }
    }

    if (action === 'archive') {
      if (!hasOracleSignOff && !force) {
        return {
          trackId,
          action,
          success: false,
          message: `Oracle sign-off required before archiving track ${trackId}.`,
        };
      }

      const archiveDirPath = path.join(this.archiveDir, trackId);
      this.logger.log(`[TrackLifecycleWizard] Archiving track ${trackId} to ${archiveDirPath}...`);

      try {
        if (!fs.existsSync(this.archiveDir)) {
          fs.mkdirSync(this.archiveDir, { recursive: true });
        }

        if (this.archiveManager) {
          await this.archiveManager.archiveTrack(trackId);
        } else {
          const trackDirPath = path.join(this.tracksDir, trackId);
          if (fs.existsSync(trackDirPath)) {
            fs.renameSync(trackDirPath, archiveDirPath);
          }
          if (fs.existsSync(this.tracksRegistryPath)) {
            const content = fs.readFileSync(this.tracksRegistryPath, 'utf8');
            const lines = content.split('\n');
            const filtered = lines.filter((l) => !l.includes(trackId));
            fs.writeFileSync(this.tracksRegistryPath, filtered.join('\n'), 'utf8');
          }
        }

        return {
          trackId,
          action,
          success: true,
          message: `Track ${trackId} successfully archived`,
          archivedPath: archiveDirPath,
        };
      } catch (err: any) {
        return {
          trackId,
          action,
          success: false,
          message: `Archival failed: ${err.message}`,
        };
      }
    }

    if (action === 'delete') {
      if (!hasOracleSignOff && !force) {
        return {
          trackId,
          action,
          success: false,
          message: `Oracle sign-off required before deleting track ${trackId}.`,
        };
      }

      if (options.executionMode === 'interactive' && !force) {
        const confirmAnswer = await this.promptFn({
          type: 'confirm',
          name: 'confirmDelete',
          message: `Are you sure you want to permanently delete track '${trackId}'?`,
          initial: false,
        });

        if (!confirmAnswer || !confirmAnswer.confirmDelete) {
          return {
            trackId,
            action,
            success: false,
            message: `Deletion cancelled by user`,
          };
        }
      }

      this.logger.log(`[TrackLifecycleWizard] Deleting track ${trackId}...`);
      const trackDirPath = path.join(this.tracksDir, trackId);
      if (fs.existsSync(trackDirPath)) {
        fs.rmSync(trackDirPath, { recursive: true, force: true });
      }

      if (fs.existsSync(this.tracksRegistryPath)) {
        const content = fs.readFileSync(this.tracksRegistryPath, 'utf8');
        const lines = content.split('\n');
        const filteredLines = lines.filter((line) => !line.includes(trackId));
        fs.writeFileSync(this.tracksRegistryPath, filteredLines.join('\n'), 'utf8');
      }

      return {
        trackId,
        action,
        success: true,
        message: `Track ${trackId} permanently deleted`,
        deleted: true,
      };
    }

    if (action === 'skip') {
      return {
        trackId,
        action,
        success: true,
        message: `Finalization skipped for track ${trackId}`,
      };
    }

    return {
      trackId,
      action,
      success: false,
      message: `Unknown action: ${action}`,
    };
  }

  /**
   * Generates blast radius impact analysis markdown section and extracts upgrade tasks for plan.md.
   */
  public async generateBlastRadiusSection(params: {
    targetSymbols?: string[];
    changedFiles?: string[];
    featureKeywords?: string[];
    projectRoot?: string;
  }): Promise<BlastRadiusSectionResult> {
    const analyzer = new BlastRadiusAnalyzer({
      projectRoot: params.projectRoot || this.projectRoot,
    });
    const report = await analyzer.analyze({
      targetSymbols: params.targetSymbols,
      changedFiles: params.changedFiles,
      featureKeywords: params.featureKeywords,
    });
    const markdown = report.formatMarkdown();
    const planTasks = this.extractUpgradePlanTasks(report);

    return {
      markdown,
      report,
      planTasks,
    };
  }

  /**
   * Automatically extracts upgrade candidate tasks and formats them as plan tasks with UPGRADES: and PROTECTED: tags.
   */
  public extractUpgradePlanTasks(report: BlastRadiusReport): string[] {
    if (!report.upgradeCandidates || report.upgradeCandidates.length === 0) {
      return [];
    }

    const protectedFiles: string[] = [];
    if (report.directImpactedFiles && report.directImpactedFiles.length > 0) {
      for (const d of report.directImpactedFiles) {
        if (!protectedFiles.includes(d.file)) {
          protectedFiles.push(d.file);
        }
      }
    }
    if (report.downstreamConsumers && report.downstreamConsumers.length > 0) {
      for (const c of report.downstreamConsumers) {
        if (!protectedFiles.includes(c.file)) {
          protectedFiles.push(c.file);
        }
      }
    }

    const tasks: string[] = [];
    for (const candidate of report.upgradeCandidates) {
      const taskLines = [
        `- [ ] Task: Upgrade ${candidate.file} to adopt ${candidate.suggestion} [TIER-2] [AGENT:superconductor-processor]`,
        `    UPGRADES: ${candidate.file}`,
      ];

      if (protectedFiles.length > 0) {
        taskLines.push(`    PROTECTED: ${protectedFiles.join(', ')}`);
      }

      taskLines.push(
        `    INVARIANT_AFTER: "Refactored call-sites preserve contract compatibility."`,
        `    - [ ] Refactor pattern \`${candidate.pattern}\` -> \`${candidate.suggestion}\``,
        `    - [ ] Verify regression tests pass for ${candidate.file}`
      );

      tasks.push(taskLines.join('\n'));
    }

    return tasks;
  }

  /**
   * Formats the extracted upgrade candidate tasks into a markdown section for plan.md.
   */
  public formatUpgradePlanSection(report: BlastRadiusReport): string {
    const tasks = this.extractUpgradePlanTasks(report);
    if (tasks.length === 0) {
      return '';
    }
    return `### Upgrade Candidate Tasks (Blast Radius)\n\n${tasks.join('\n\n')}`;
  }
}

