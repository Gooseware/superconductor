import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { QuorumReviewLoop } from '../packages/engine/src/verification/quorum-review-loop';

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('Usage: tsx quorum-review.ts <file-to-review>');
    process.exit(1);
}

const codeToReview = fs.readFileSync(targetFile, 'utf8');

const loop = new QuorumReviewLoop({
  maxIterations: parseInt(process.env.MAX_ITERATIONS || '3'),
  reviewerFn: async (code) => {
    console.log(`[Reviewer] Analyzing ${targetFile}...`);
    try {
        const output = execSync(`antigravity --skill standalone-review --file ${targetFile}`).toString();
        // If there are findings, simulate rejection
        if (output.includes('Findings') || output.includes('findings')) {
            return { status: 'REJECTED', findings: ['Review panel reported findings'] };
        }
        return { status: 'RESOLVED', findings: [] };
    } catch (e: any) {
        return { status: 'REJECTED', findings: [e.message] };
    }
  },
  remediateFn: async (code, findings) => {
    console.log(`[Remediator] Remediation required for ${targetFile}...`);
    try {
        execSync(`antigravity --skill remediation-processor --file ${targetFile}`);
        return fs.readFileSync(targetFile, 'utf8');
    } catch (e) {
        console.error('Remediation failed', e);
        return code;
    }
  }
});

loop.run(codeToReview).then((res) => {
    console.log('Quorum Review Result:', res);
    process.exit(res.status === 'RESOLVED' ? 0 : 1);
}).catch(err => {
    console.error('Quorum Review Error:', err);
    process.exit(1);
});
