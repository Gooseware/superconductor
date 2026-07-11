export class DaemonHeartbeat {
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeat: number = 0;
    private intervalMs: number;
    private onTimeout: () => void;

    constructor(intervalMs: number = 10000, onTimeout: () => void = () => { process.exit(1); }) {
        this.intervalMs = intervalMs;
        this.onTimeout = onTimeout;
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

    public stop(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
