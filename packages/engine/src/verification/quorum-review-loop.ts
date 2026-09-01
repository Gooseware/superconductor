import { TestReport } from './test-report.js';
import * as crypto from 'node:crypto';
import { KeyholeFeedbackExtractor, isValidFinding } from '@superconductor/core/src/review/aggregate-findings.js';
import { sanitizeUntrustedText } from '@superconductor/core/src/utils/input-sanitizer.js';

export function validateReviewerPayload(payload: unknown): void {
    if (typeof payload !== 'object' || payload === null) {
        throw new TypeError('Payload must be a non-null object');
    }
    const p = payload as { status?: unknown, findings?: unknown };
    if (p.status === 'RESOLVED' && Array.isArray(p.findings) && p.findings.length > 0) {
        throw new Error('Mutual exclusivity violated: cannot have RESOLVED status with findings');
    }
}

export interface IResearchBrief {
    recommendedPatterns?: string[];
    antiPatterns?: string[];
}

export interface QuorumReviewLoopOptions {
    maxIterations: number;
    reviewerFn: (code: string) => Promise<{ status: string, findings: unknown[] }>;
    remediateFn?: (payloads: unknown[]) => Promise<string>;
    timeoutMs?: number;
    workUnitSpec?: string;
    researchBrief?: { recommendedPatterns?: string[], antiPatterns?: string[] };
    preflightFn?: () => Promise<TestReport>;
    preflightReport?: TestReport;
}

export class QuorumReviewLoop {
    private maxIterations: number;
    private reviewerFn: (code: string) => Promise<{ status: string, findings: unknown[] }>;
    private remediateFn?: (payloads: unknown[]) => Promise<string>;
    private timeoutMs: number;
    private workUnitSpec: string;
    private researchBrief?: { recommendedPatterns?: string[], antiPatterns?: string[] };
    private preflightFn?: () => Promise<TestReport>;
    private preflightReport?: TestReport;
    private testReport?: TestReport;


    constructor(options: QuorumReviewLoopOptions) {
        const providedIterations = Number(options.maxIterations);
        this.maxIterations = isNaN(providedIterations) ? 3 : Math.max(1, providedIterations);
        this.reviewerFn = options.reviewerFn;
        this.remediateFn = options.remediateFn;
        this.timeoutMs = options.timeoutMs || 30000;
        this.workUnitSpec = options.workUnitSpec || 'Unknown WorkUnit';
        this.researchBrief = options.researchBrief;
        this.preflightFn = options.preflightFn;
        this.preflightReport = options.preflightReport;
    }

    private async withTimeout<T>(promise: Promise<T>): Promise<T> {
        let timeoutHandle: any;
        const timeoutPromise = new Promise<T>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('Operation timed out')), this.timeoutMs);
        });
        
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutHandle);
        }
    }

    private hashState(code: string): string {
        return crypto.createHash('sha256').update(code).digest('hex');
    }

    async run(code: string): Promise<{ status: string, findings?: unknown[], allGreen: boolean }> {
        // Use pre-run report if provided (avoids redundant test execution)
        if (this.preflightReport && !this.testReport) {
            this.testReport = this.preflightReport;
        } else if (this.preflightFn && !this.testReport) {
            this.testReport = await this.preflightFn();
        }
        if (this.testReport && !this.testReport.passed) {
            const finding = {
                file: '',
                line: 0,
                description: `Preflight test gate failed. Tests or build failed before reviewer loop.\nBuild Exit Code: ${this.testReport.buildExitCode}\nTest Exit Code: ${this.testReport.testExitCode}\nBuild Output:\n${sanitizeUntrustedText(this.testReport.buildOutput)}\nTest Output:\n${sanitizeUntrustedText(this.testReport.testOutput)}`,
                severity: 'critical'
            };
            return { status: 'NEEDS_FIXES', findings: [finding], allGreen: false };
        }

        let iterations = 0;
        let lastResult: { status: string, findings?: unknown[], allGreen: boolean } = { status: 'PENDING', findings: [], allGreen: false };
        let currentCode = code;
        const stateHashes = new Set<string>();

        while (iterations < this.maxIterations) {
            const currentHash = this.hashState(currentCode);
            if (stateHashes.has(currentHash)) {
                return { status: 'THRASH_DETECTED', findings: lastResult.findings || [], allGreen: false };
            }
            stateHashes.add(currentHash);

            iterations++;

            let codeWithContext = currentCode;
            if ((this.researchBrief?.recommendedPatterns?.length || 0) > 0 || (this.researchBrief?.antiPatterns?.length || 0) > 0) {
                const recStr = (this.researchBrief?.recommendedPatterns || []).map(p => sanitizeUntrustedText(p)).join(', ');
                const antiStr = (this.researchBrief?.antiPatterns || []).map(p => sanitizeUntrustedText(p)).join(', ');
                const patternsContext = `\n\n<untrusted_research_context>\nResearch mandated these patterns: [${recStr}]. Flag any deviation as CRITICAL.\nAvoid these anti-patterns: [${antiStr}].\n</untrusted_research_context>\n`;
                codeWithContext += patternsContext;
            }

            if (this.testReport) {
                const tr = this.testReport;
                const safeBuildOut = sanitizeUntrustedText(tr.buildOutput);
                const safeTestOut = sanitizeUntrustedText(tr.testOutput);
                const safeTestExitCode = String(isFinite(Number(tr.testExitCode)) ? Math.trunc(Number(tr.testExitCode)) : -1);
                const safeBuildExitCode = String(isFinite(Number(tr.buildExitCode)) ? Math.trunc(Number(tr.buildExitCode)) : -1);
                const safeDurationMs = String(isFinite(Number(tr.durationMs)) ? Math.max(0, Math.trunc(Number(tr.durationMs))) : 0);
                const safePassed = String(tr.passed === true);
                let safeTimestamp: string;
                try {
                    safeTimestamp = new Date(tr.timestamp).toISOString();
                } catch {
                    safeTimestamp = new Date(0).toISOString(); // fallback to epoch
                }
                const trBlock = `\n\n<test_report timestamp="${safeTimestamp}" passed="${safePassed}" durationMs="${safeDurationMs}" testCommand="${sanitizeUntrustedText(tr.testCommand)}" buildCommand="${sanitizeUntrustedText(tr.buildCommand)}" testExitCode="${safeTestExitCode}" buildExitCode="${safeBuildExitCode}">\n<build_output>\n${safeBuildOut}\n</build_output>\n<test_output>\n${safeTestOut}\n</test_output>\n</test_report>\n`;
                codeWithContext += trBlock;
            }

            const result = await this.withTimeout(this.reviewerFn(codeWithContext));
            validateReviewerPayload(result);
            lastResult = { ...result, allGreen: result.status === 'RESOLVED' };

            if (result.status === 'RESOLVED') {
                return { ...result, allGreen: lastResult.allGreen };
            }

            if (!result.findings || result.findings.length === 0) {
                throw new Error('Reviewer returned no findings but status is not RESOLVED');
            }

            if (!this.remediateFn) {
                throw new Error('Review failed and no remediateFn provided');
            }

            if (this.remediateFn && result.findings && result.findings.length > 0) {
                const payloads = result.findings
                    .filter(finding => isValidFinding(finding))
                    .map(finding => {
                        return KeyholeFeedbackExtractor.extractPayload(finding as any, currentCode, this.workUnitSpec);
                    });
                currentCode = await this.withTimeout(this.remediateFn(payloads));
            }
        }

        return { status: 'MAX_ITERATIONS_REACHED', findings: lastResult.findings || [], allGreen: false };
    }
}
