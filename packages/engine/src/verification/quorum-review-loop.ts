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
}

export class QuorumReviewLoop {
    private maxIterations: number;
    private reviewerFn: (code: string) => Promise<{ status: string, findings: unknown[] }>;
    private remediateFn?: (payloads: unknown[]) => Promise<string>;
    private timeoutMs: number;
    private workUnitSpec: string;
    private researchBrief?: { recommendedPatterns?: string[], antiPatterns?: string[] };

    constructor(options: QuorumReviewLoopOptions) {
        const providedIterations = Number(options.maxIterations);
        this.maxIterations = isNaN(providedIterations) ? 3 : Math.max(1, providedIterations);
        this.reviewerFn = options.reviewerFn;
        this.remediateFn = options.remediateFn;
        this.timeoutMs = options.timeoutMs || 30000;
        this.workUnitSpec = options.workUnitSpec || 'Unknown WorkUnit';
        this.researchBrief = options.researchBrief;
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
                const payloads = result.findings.map(finding => {
                    // Try to map to KeyholePayload if it looks like a finding object
                    if (isValidFinding(finding)) {
                        return KeyholeFeedbackExtractor.extractPayload(finding, currentCode, this.workUnitSpec);
                    }
                    // Fallback for primitive tests
                    return finding;
                });
                currentCode = await this.withTimeout(this.remediateFn(payloads));
            }
        }

        return { status: 'MAX_ITERATIONS_REACHED', findings: lastResult.findings || [], allGreen: false };
    }
}
