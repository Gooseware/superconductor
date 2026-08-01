import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class YoloAuditLogger {
    private logFile: string;

    constructor(private workspacePath: string) {
        const logDir = path.join(this.workspacePath, 'superconductor', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        this.logFile = path.join(logDir, 'yolo-audit.log');
    }

    public init() {
        if (!fs.existsSync(this.logFile)) {
            fs.appendFileSync(this.logFile, '', { mode: 0o600 });
        }

        try {
            fs.chmodSync(this.logFile, 0o600);
        } catch (error: any) {
            throw new Error(`Failed to enforce permissions on audit log: ${error.message}`);
        }

        const stats = fs.statSync(this.logFile);
        if ((stats.mode & 0o077) !== 0) {
            throw new Error(`Audit log file permissions too open. Expected 0o600, got ${stats.mode.toString(8)}`);
        }
    }

    public logToolCall(tool: string, args: any, sessionId: string) {
        const argsString = JSON.stringify(args);
        const argsHash = crypto.createHash('sha256').update(argsString).digest('hex');

        const logEntry = {
            timestamp: new Date().toISOString(),
            mode: 'YOLO',
            tool,
            argsHash,
            sessionId,
            bypass: true
        };

        fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
    }

    public logOverride(choice: string, tool: string, args: any) {
        const argsString = JSON.stringify(args);
        const argsHash = crypto.createHash('sha256').update(argsString).digest('hex');

        const logEntry = {
            timestamp: new Date().toISOString(),
            event: 'INLINE_OVERRIDE',
            choice,
            tool,
            argsHash
        };

        fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
    }
}
