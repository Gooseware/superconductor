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
    
    constructor(private targetFile: string) { this.loadState(); }

    private loadState() {
        const stateFile = require('node:path').join(process.cwd(), 'superconductor/logs/quorum-state.json');
        if (require('node:fs').existsSync(stateFile)) {
            try {
                const data = require('node:fs').readFileSync(stateFile, 'utf8');
                this.stateData = JSON.parse(data);
            } catch (err) {
                console.error("Failed to load state", err);
            }
        }
    }

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
        switch (newState) {
            case 'IDLE':
            case 'REVIEW_PENDING':
            case 'ANALYSIS':
            case 'REMEDIATION_REQUIRED':
            case 'APPROVED':
            case 'FAILED':
            case 'REQUIRES_HUMAN_INTERVENTION':
                this.stateData.state = newState;
                break;
            default:
                throw new Error(`Invalid FSM transition: ${newState}`);
        }
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
                    const lines = output.split('\n').map((l: string) => l.trim());
                    const hasApprovalLine = lines.some((l: string) => /^APPROVED:\s*NO\s+FINDINGS$/i.test(l));
                    const findingsBlock = output.match(/```json:review-findings([\s\S]*?)```/);
                    const hasStructuredFindings = !!(findingsBlock && findingsBlock[1].trim() !== '[]' && findingsBlock[1].trim() !== '');
                    // Also catch plain-text finding indicators outside the fenced block (e.g. "REV-1 critical...", "NEEDS FIXES")
                    const hasPlainTextFindings = lines.some((l: string) => /^(NEEDS\s+FIXES|[A-Z]+-\d+[\s:—])/i.test(l));
                    const approved = hasApprovalLine && !hasStructuredFindings && !hasPlainTextFindings;
                    if (approved) {
                        // 0 findings, valid pass
                        continue;
                    } else if (output.includes('Findings') || output.includes('findings')) {
                        const jsonMatch = output.match(/\{[\s\S]*"findings"\s*:\s*\[[\s\S]*?\][\s\S]*\}/);
                        if (jsonMatch) {
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.findings && Array.isArray(parsed.findings)) {
                                    allFindings.push(...parsed.findings.map((f: any) => typeof f === 'string' ? f : JSON.stringify(f)));
                                }
                            } catch (err: any) {
                                allFindings.push(`Failed to parse reviewer output: ${err.message || 'Invalid JSON'}`);
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
            
            // Dispatch remediators in parallel grouped by domain (file prefix + category)
            const groupedFindings: Record<string, any[]> = {};
            this.stateData.findings.forEach(findingStr => {
                let parsedFinding: any;
                try {
                    parsedFinding = JSON.parse(findingStr);
                } catch {
                    parsedFinding = { description: findingStr };
                }
                const file = parsedFinding.file || this.targetFile;
                const category = parsedFinding.category || 'general';
                const domain = `${file}-${category}`;
                
                if (!groupedFindings[domain]) {
                    groupedFindings[domain] = [];
                }
                groupedFindings[domain].push(parsedFinding);
            });
            
            const remediationPromises = Object.values(groupedFindings).map(group => {
                const findingsArg = JSON.stringify(group);
                return execFileAsync('antigravity', ['--skill', 'remediation-processor', '--file', this.targetFile, '--findings', findingsArg]);
            });
            
            const remResults = await Promise.allSettled(remediationPromises);
            for (const res of remResults) {
                if (res.status === 'rejected') {
                    this.transition('REQUIRES_HUMAN_INTERVENTION');
                    return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings, reason: 'Remediator process rejected', error: String(res.reason) };
                }
                const output = ((res.value as any)?.stdout ?? '') + ((res.value as any)?.stderr ?? '');
                if (((res.value as any)?.exitCode ?? (res.value as any)?.code ?? 0) !== 0 || /ERROR|FAILED/i.test(output)) {
                    this.transition('REQUIRES_HUMAN_INTERVENTION');
                    return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings, reason: 'Remediator reported failure', output: output.slice(0, 500) };
                }
            }
            
            // Wait for all remediators to complete before re-entering REVIEW_PENDING
            this.transition('REVIEW_PENDING');
        }
        
        this.transition('REQUIRES_HUMAN_INTERVENTION');
        return { status: 'REQUIRES_HUMAN_INTERVENTION', findings: this.stateData.findings };
    }
}

function validateTargetFile(input: string): string {
  const trimmed = input.trim();
  const resolved = path.resolve(trimmed);
  if (trimmed.startsWith('-') || path.basename(resolved).trimStart().startsWith('-')) {
    throw new Error(`Invalid target file: argument injection risk in "${input}"`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`Target file not found: ${resolved}`);
  return resolved;
}

if (require.main === module) {
    const targetFileRaw = process.argv[2];
    if (!targetFileRaw) {
        console.error('Usage: tsx quorum-review.ts <file-to-review>');
        process.exit(1);
    }
    const targetFile = validateTargetFile(targetFileRaw);

    const fsm = new QuorumFSM(targetFile);
    fsm.run().then(res => {
        console.log('Quorum Review Result:', res);
        process.exit(res.status === 'APPROVED' ? 0 : 1);
    }).catch(err => {
        console.error('Quorum Review Error:', err);
        process.exit(1);
    });
}
