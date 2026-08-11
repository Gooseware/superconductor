import { scoreDomains, DomainScore } from './domain-scorer.js';
import { runQuorumReview } from './quorum-review.js';

export interface CodebaseReviewOptions {
  intelligenceDir: string;
  noSignoff: boolean;
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

    const args = ['--branch', d.domain];
    if (options.noSignoff) {
      args.push('--no-signoff');
    }

    await runner(args);
  }

  console.log('[CodebaseReviewOrchestrator] All domains PASSED. Triggering cross-domain Oracle synthesis...');
}

export const orchestrateCopdebaseReview = orchestrateCodebaseReview;
