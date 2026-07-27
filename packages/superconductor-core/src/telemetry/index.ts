import { promises as fs } from 'fs';
import * as path from 'path';

export interface TokenUsageReport {
    trackId: string;
    subagentId: string;
    stepIndex: number;
    promptTokens: number;
    completionTokens: number;
    timestamp: number;
}

export interface MetricReport {
    trackId: string;
    metricType: 'DISPATCH_COUNT' | 'FEEDBACK_LOOP' | 'RESOLUTION_TIME';
    value: number;
    metadata?: Record<string, any>;
    timestamp: number;
}

export interface TelemetryStore {
    recordUsage(report: TokenUsageReport): Promise<void>;
    recordMetric?(report: MetricReport): Promise<void>;
}

export class FileTelemetryStore implements TelemetryStore {
    private filePath: string;
    private initPromise: Promise<void> | null = null;
    private queue: Promise<void> = Promise.resolve();

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    private ensureDir(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                const dir = path.dirname(this.filePath);
                await fs.mkdir(dir, { recursive: true });
            })();
        }
        return this.initPromise;
    }

    async recordUsage(report: TokenUsageReport): Promise<void> {
        if (!report) {
            throw new Error("Report is required");
        }
        if (typeof report.promptTokens !== 'number' || report.promptTokens < 0 || !Number.isInteger(report.promptTokens)) {
            throw new Error("promptTokens must be a non-negative integer");
        }
        if (typeof report.completionTokens !== 'number' || report.completionTokens < 0 || !Number.isInteger(report.completionTokens)) {
            throw new Error("completionTokens must be a non-negative integer");
        }
        if (!report.trackId || typeof report.trackId !== 'string') {
            throw new Error("trackId must be a non-empty string");
        }
        if (!report.subagentId || typeof report.subagentId !== 'string') {
            throw new Error("subagentId must be a non-empty string");
        }

        const line = JSON.stringify({ type: 'TOKEN_USAGE', ...report }) + '\n';
        
        const task = this.queue.then(async () => {
            await this.ensureDir();
            await fs.appendFile(this.filePath, line, 'utf-8');
        });
        
        this.queue = task.catch(() => {});
        await task;
    }

    async recordMetric(report: MetricReport): Promise<void> {
        if (!report) {
            throw new Error("Report is required");
        }
        if (!report.trackId || typeof report.trackId !== 'string') {
            throw new Error("trackId must be a non-empty string");
        }
        if (!['DISPATCH_COUNT', 'FEEDBACK_LOOP', 'RESOLUTION_TIME'].includes(report.metricType)) {
            throw new Error("Invalid metricType");
        }
        if (typeof report.value !== 'number') {
            throw new Error("value must be a number");
        }

        const line = JSON.stringify({ type: 'METRIC', ...report }) + '\n';
        
        const task = this.queue.then(async () => {
            await this.ensureDir();
            await fs.appendFile(this.filePath, line, 'utf-8');
        });
        
        this.queue = task.catch(() => {});
        await task;
    }
}

export * from './token-budget-estimator.js';

