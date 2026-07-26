export function validateReviewerPayload(payload: any): void {
    if (payload.status === 'RESOLVED' && payload.findings && payload.findings.length > 0) {
        throw new Error('Mutual exclusivity violated: cannot have RESOLVED status with findings');
    }
}

export interface QuorumReviewLoopOptions {
    maxIterations: number;
    reviewerFn: (code: string) => Promise<{ status: string, findings: string[] }>;
    remediateFn?: (code: string, findings: string[]) => Promise<string>;
    timeoutMs?: number;
}

export class QuorumReviewLoop {
    private maxIterations: number;
    private reviewerFn: (code: string) => Promise<{ status: string, findings: string[] }>;
    private remediateFn?: (code: string, findings: string[]) => Promise<string>;
    private timeoutMs: number;

    constructor(options: QuorumReviewLoopOptions) {
        this.maxIterations = Math.max(1, options.maxIterations);
        this.reviewerFn = options.reviewerFn;
        this.remediateFn = options.remediateFn;
        this.timeoutMs = options.timeoutMs || 30000;
    }

    private async withTimeout<T>(promise: Promise<T>): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Operation timed out')), this.timeoutMs))
        ]);
    }

    async run(code: string): Promise<{ status: string, findings?: string[] }> {
        let iterations = 0;
        let lastResult: { status: string, findings?: string[] } = { status: 'PENDING', findings: [] };
        let currentCode = code;

        while (iterations < this.maxIterations) {
            iterations++;
            const result = await this.withTimeout(this.reviewerFn(currentCode));
            validateReviewerPayload(result);
            lastResult = result;

            if (result.status === 'RESOLVED') {
                return result;
            }

            if (!result.findings || result.findings.length === 0) {
                throw new Error('Reviewer returned no findings but status is not RESOLVED');
            }

            if (this.remediateFn && result.findings && result.findings.length > 0) {
                currentCode = await this.withTimeout(this.remediateFn(currentCode, result.findings));
            }
        }

        return { status: 'MAX_ITERATIONS_REACHED', findings: lastResult.findings || [] };
    }
}
