import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as util from 'node:util';
import { QuorumReviewLoop } from '../packages/engine/src/verification/quorum-review-loop';

const execFileAsync = util.promisify(execFile);

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('Usage: tsx quorum-review.ts <file-to-review>');
    process.exit(1);
}

const codeToReview = fs.readFileSync(targetFile, 'utf8');

const loop = new QuorumReviewLoop({
  maxIterations: parseInt(process.env.MAX_ITERATIONS || '3', 10),
  timeoutMs: 120000,
  reviewerFn: async (code) => {
    console.log(`[Reviewer] Analyzing ${targetFile}...`);
    try {
        const { stdout: output } = await execFileAsync('antigravity', ['--skill', 'standalone-review', '--file', targetFile]);
        // If there are findings, extract them
        if (output.includes('Findings') || output.includes('findings')) {
            let extractedFindings = ['Review panel reported findings'];
            const jsonMatch = output.match(/\{[\s\S]*"findings"\s*:\s*\[[\s\S]*?\][\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.findings && Array.isArray(parsed.findings)) {
                        extractedFindings = parsed.findings;
                    }
                } catch (err) {}
            }
            return { status: 'REJECTED', findings: extractedFindings };
        }
        return { status: 'RESOLVED', findings: [] };
    } catch (e: any) {
        return { status: 'REJECTED', findings: [e.message] };
    }
  },
  remediateFn: async (code, findings) => {
    console.log(`[Remediator] Remediation required for ${targetFile}...`);
    try {
        const findingsArg = JSON.stringify(findings);
        await execFileAsync('antigravity', ['--skill', 'remediation-processor', '--file', targetFile, '--findings', findingsArg]);
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
