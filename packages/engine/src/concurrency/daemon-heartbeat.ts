import * as fs from 'fs';
import * as path from 'path';

export interface EngineState {
    context?: string;
    [key: string]: any;
}

export interface DaemonOptions {
    onReinject?: () => void;
    onEscalate?: () => void;
    maxRetries?: number;
}

export class DaemonHeartbeat {
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeat: number = 0;
    private intervalMs: number;
    private onTimeout: () => void;
    private options: DaemonOptions;
    private retryCount: number = 0;

    constructor(
        intervalMs: number = 10000, 
        onTimeout: () => void = () => { console.error('Daemon heartbeat timeout'); },
        options: DaemonOptions = {}
    ) {
        this.intervalMs = intervalMs;
        this.onTimeout = onTimeout;
        this.options = {
            maxRetries: 3,
            ...options
        };
    }

    public start(): void {
        if (this.heartbeatInterval) {
            this.stop();
        }
        this.ping();
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - this.lastHeartbeat > this.intervalMs * 2) {
                this.stop();
                this.onTimeout();
            }
        }, this.intervalMs);
    }

    public ping(): void {
        this.lastHeartbeat = Date.now();
    }

    public verifyTrackContext(engineState: EngineState, workspaceDirOrPlanPath: string = process.cwd(), trackId?: string): void {
        if (engineState.context != null) {
            this.retryCount = 0;
        } else {
            const max = this.options.maxRetries ?? 3;
            if (this.retryCount > max) { return; }

            if (this.retryCount < max) {
                this.retryCount++;
            } else if (this.retryCount === max) {
                this.retryCount++;
                if (this.options.onEscalate) {
                    this.options.onEscalate();
                }
                return;
            }

            let planPath = workspaceDirOrPlanPath;
            if (trackId) {
                planPath = path.join(workspaceDirOrPlanPath, 'superconductor', 'tracks', trackId, 'plan.md');
            } else if (!planPath.endsWith('plan.md')) {
                planPath = path.join(workspaceDirOrPlanPath, 'plan.md');
            }

            try {
                engineState.context = fs.readFileSync(planPath, 'utf8');
                if (this.options.onReinject) {
                    this.options.onReinject();
                }
            } catch (err: any) {
                // Safely log and swallow errors as failed attempts
                console.warn('Failed to read plan.md', err);
            }
        }
    }

    public stop(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
