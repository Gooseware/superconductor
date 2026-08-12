import { scoreDomains, DomainScore } from './domain-scorer.js';
import { runQuorumReview } from './quorum-review.js';
import * as child_process from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(child_process.execFile);

export interface CodebaseReviewOptions {
  intelligenceDir: string;
  noSignoff: boolean;
  branch?: string;
  scoreDomainsFn?: (dir: string) => Promise<DomainScore[]>;
  runQuorumFn?: (args: string[]) => Promise<void>;
}

export async function orchestrateCodebaseReview(options: CodebaseReviewOptions): Promise<void> {
  const scorer = options.scoreDomainsFn || scoreDomains;
  const runner = options.runQuorumFn || ((args: string[]) => runQuorumReview(args));

  const domains = await scorer(options.intelligenceDir);

  for (const d of domains) {
    console.log(
      `[CodebaseReviewOrchestrator] Reviewing domain ${d.domain} (priority score: ${d.priority_score}) with ${d.files.length} files...`
    );

    const args = [];
    if (options.branch) {
      args.push('--branch', options.branch);
    }
    args.push('--domain', d.domain);
    if (options.noSignoff) {
      args.push('--no-signoff');
    }

    const cycles = await runner(args);
    console.log(`[Badge] Domain ${d.domain}: GREEN (Cycles: ${cycles})`);
  }

  console.log('[CodebaseReviewOrchestrator] All domains PASSED. Triggering cross-domain Oracle synthesis...');
  try {
    await execFileAsync('antigravity', ['--oracle-synthesis']);
  } catch (err: any) {
    console.error(`[CodebaseReviewOrchestrator] Oracle synthesis failed: ${err.message}`);
  }
}

export const orchestrateCopdebaseReview = orchestrateCodebaseReview;
