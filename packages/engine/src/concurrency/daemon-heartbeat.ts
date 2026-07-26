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
        onTimeout: () => void = () => { process.exit(1); },
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
        this.ping();
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - this.lastHeartbeat > this.intervalMs * 2) {
                this.onTimeout();
            }
        }, this.intervalMs);
    }

    public ping(): void {
        this.lastHeartbeat = Date.now();
    }

    public verifyTrackContext(hasContext: boolean): void {
        if (hasContext) {
            this.retryCount = 0;
        } else {
            const max = this.options.maxRetries ?? 3;
            if (this.retryCount < max) {
                this.retryCount++;
                if (this.options.onReinject) {
                    this.options.onReinject();
                }
            } else {
                if (this.options.onEscalate) {
                    this.options.onEscalate();
                }
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
