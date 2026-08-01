const fs = require('fs');
let content = fs.readFileSync('scripts/quorum-review.ts', 'utf8');

// Bug 1
content = content.replace(
    `['--skill', 'remediation-processor', '--file', '--', this.targetFile, '--findings', findingsArg]`,
    `['--skill', 'remediation-processor', '--file', this.targetFile, '--findings', findingsArg]`
);
content = content.replace(
    `['--skill', reviewer, '--file', '--', this.targetFile]`,
    `['--skill', reviewer, '--file', this.targetFile]`
);

// Bug 2
const allSettledOld = `            await Promise.allSettled(remediationPromises);`;
const allSettledNew = `            const remResults = await Promise.allSettled(remediationPromises);
            for (const res of remResults) {
                if (res.status === 'rejected') {
                    console.error('Remediator rejected:', res.reason);
                    this.transition('REQUIRES_HUMAN_INTERVENTION');
                    return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings, reason: 'Remediator rejected: ' + (res.reason?.message || 'unknown error') };
                }
            }`;
content = content.replace(allSettledOld, allSettledNew);

// Bug 3
const reviewerLogicOld = `            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const output = result.value.stdout;
                    if (output.includes('Findings') || output.includes('findings')) {
                        const jsonMatch = output.match(/\\{[\\s\\S]*"findings"\\s*:\\s*\\[[\\s\\S]*?\\][\\s\\S]*\\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.findings && Array.isArray(parsed.findings)) {
                                    allFindings.push(...parsed.findings.map((f: any) => typeof f === 'string' ? f : JSON.stringify(f)));
                                }
                            } catch (err: any) {
                                allFindings.push(\`Failed to parse reviewer output: \${err.message || 'Invalid JSON'}\`);
                            }
                        } else {
                            allFindings.push('Review panel reported findings');
                        }
                    }
                } else {
                    allFindings.push(result.reason?.message || 'Review failed');
                }
            }`;

const reviewerLogicNew = `            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const output = result.value.stdout;
                    if (output.includes('APPROVED: NO FINDINGS')) {
                        // 0 findings, valid pass
                        continue;
                    } else if (output.includes('Findings') || output.includes('findings')) {
                        const jsonMatch = output.match(/\\{[\\s\\S]*"findings"\\s*:\\s*\\[[\\s\\S]*?\\][\\s\\S]*\\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.findings && Array.isArray(parsed.findings)) {
                                    allFindings.push(...parsed.findings.map((f: any) => typeof f === 'string' ? f : JSON.stringify(f)));
                                }
                            } catch (err: any) {
                                allFindings.push(\`Failed to parse reviewer output: \${err.message || 'Invalid JSON'}\`);
                            }
                        } else {
                            allFindings.push('Review panel reported findings');
                        }
                    } else {
                        // Missing/ambiguous output -> treat as PARSE_ERROR
                        this.transition('REQUIRES_HUMAN_INTERVENTION');
                        return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings, reason: 'PARSE_ERROR: Missing or ambiguous reviewer output' };
                    }
                } else {
                    // Process crash / non-zero exit code -> treat as reviewer failure, not as approval
                    this.transition('REQUIRES_HUMAN_INTERVENTION');
                    return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings, reason: 'Reviewer process crashed or failed: ' + (result.reason?.message || 'unknown error') };
                }
            }`;
content = content.replace(reviewerLogicOld, reviewerLogicNew);

fs.writeFileSync('scripts/quorum-review.ts', content, 'utf8');
