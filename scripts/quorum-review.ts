import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import * as util from 'node:util';

const execFileAsync = util.promisify(execFile);

export type FSMState = 'IDLE' | 'REVIEW_PENDING' | 'ANALYSIS' | 'REMEDIATION_REQUIRED' | 'APPROVED' | 'FAILED' | 'REQUIRES_HUMAN_INTERVENTION';

export interface QuorumState {
    state: FSMState;
    loops: number;
    findings: string[];
    history: string[];
}

export const MAX_QUORUM_LOOPS = 3;

export class QuorumFSM {
    stateData: QuorumState = {
        state: 'IDLE',
        loops: 0,
        findings: [],
        history: []
    };
    
    constructor(private targetFile: string) {}

    private persistState() {
        const logDir = path.join(process.cwd(), 'superconductor/logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const stateFile = path.join(logDir, 'quorum-state.json');
        const tempFile = stateFile + '.tmp';
        fs.writeFileSync(tempFile, JSON.stringify(this.stateData, null, 2), 'utf8');
        fs.renameSync(tempFile, stateFile); // atomic write
    }

    public transition(newState: FSMState) {
        this.stateData.state = newState;
        this.persistState();
    }

    async run() {
        this.transition('REVIEW_PENDING');
        
        while (this.stateData.loops < MAX_QUORUM_LOOPS) {
            this.transition('ANALYSIS');
            
            // Dispatch reviewers in parallel
            const reviewers = ['correctness-reviewer', 'security-reviewer', 'adversarial-reviewer'];
            const results = await Promise.allSettled(reviewers.map(reviewer => 
                execFileAsync('antigravity', ['--skill', reviewer, '--file', this.targetFile])
            ));

            let allFindings: string[] = [];
            
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const output = result.value.stdout;
                    if (output.includes('Findings') || output.includes('findings')) {
                        const jsonMatch = output.match(/\{[\s\S]*"findings"\s*:\s*\[[\s\S]*?\][\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.findings && Array.isArray(parsed.findings)) {
                                    allFindings.push(...parsed.findings.map((f: any) => typeof f === 'string' ? f : JSON.stringify(f)));
                                }
                            } catch (err) {}
                        } else {
                            allFindings.push('Review panel reported findings');
                        }
                    }
                } else {
                    allFindings.push(result.reason?.message || 'Review failed');
                }
            }
            
            // Deduplication (reject if matches verbatim)
            const duplicateFindings = allFindings.filter(f => this.stateData.history.includes(f));
            if (duplicateFindings.length > 0) {
                this.transition('FAILED');
                return { status: 'FAILED', findings: duplicateFindings, reason: 'Duplicate findings detected (matches verbatim)' };
            }
            
            const newFindings = [...new Set(allFindings)];
            this.stateData.history.push(...newFindings);
            this.stateData.findings = newFindings;

            if (newFindings.length === 0) {
                this.transition('APPROVED');
                return { status: 'APPROVED', findings: [] };
            }

            this.stateData.loops++;
            if (this.stateData.loops >= MAX_QUORUM_LOOPS) {
                this.transition('REQUIRES_HUMAN_INTERVENTION');
                return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings };
            }

            this.transition('REMEDIATION_REQUIRED');
            
            // Dispatch remediators in parallel
            const remediationPromises = this.stateData.findings.map(finding => {
                return execFileAsync('antigravity', ['--skill', 'remediation-processor', '--file', this.targetFile, '--findings', finding]);
            });
            
            await Promise.allSettled(remediationPromises);
            
            this.transition('REVIEW_PENDING');
        }
        
        this.transition('REQUIRES_HUMAN_INTERVENTION');
        return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings };
    }
}

if (require.main === module) {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error('Usage: tsx quorum-review.ts <file-to-review>');
        process.exit(1);
    }

    const fsm = new QuorumFSM(targetFile);
    fsm.run().then(res => {
        console.log('Quorum Review Result:', res);
        process.exit(res.status === 'APPROVED' ? 0 : 1);
    }).catch(err => {
        console.error('Quorum Review Error:', err);
        process.exit(1);
    });
}
