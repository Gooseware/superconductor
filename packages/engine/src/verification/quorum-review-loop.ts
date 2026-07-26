export interface ChunkerOptions {
    tokenLimit: number;
}

export class CodebaseChunker {
    private tokenLimit: number;

    constructor(options: ChunkerOptions) {
        this.tokenLimit = options.tokenLimit;
    }

    chunk(text: string): string[] {
        // Approximate 1 token to ~4 chars for the chunk limit
        const charLimit = this.tokenLimit * 4;
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += charLimit) {
            chunks.push(text.slice(i, i + charLimit));
        }
        return chunks;
    }
}

export function validateReviewerPayload(payload: any): void {
    if (payload.status === 'RESOLVED' && payload.findings && payload.findings.length > 0) {
        throw new Error('Mutual exclusivity violated: cannot have RESOLVED status with findings');
    }
}

export interface QuorumReviewLoopOptions {
    maxIterations: number;
    reviewerFn: (code: string) => Promise<{ status: string, findings: string[] }>;
    remediateFn?: (code: string, findings: string[]) => Promise<string>;
}

export class QuorumReviewLoop {
    private maxIterations: number;
    private reviewerFn: (code: string) => Promise<{ status: string, findings: string[] }>;
    private remediateFn?: (code: string, findings: string[]) => Promise<string>;

    constructor(options: QuorumReviewLoopOptions) {
        this.maxIterations = options.maxIterations;
        this.reviewerFn = options.reviewerFn;
        this.remediateFn = options.remediateFn;
    }

    async run(code: string): Promise<{ status: string, findings?: string[] }> {
        let iterations = 0;
        let lastResult: { status: string, findings?: string[] } = { status: 'PENDING', findings: [] };
        let currentCode = code;

        while (iterations < this.maxIterations) {
            iterations++;
            const result = await this.reviewerFn(currentCode);
            validateReviewerPayload(result);
            lastResult = result;

            if (result.status === 'RESOLVED') {
                return result;
            }

            if (this.remediateFn && result.findings && result.findings.length > 0) {
                currentCode = await this.remediateFn(currentCode, result.findings);
            }
        }

        return { status: 'MAX_ITERATIONS_REACHED', findings: lastResult.findings || [] };
    }
}
