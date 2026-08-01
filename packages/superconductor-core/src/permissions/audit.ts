import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class YoloAuditLogger {
    private logFile: string;
    private initialized: boolean = false;
    private workspacePath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        const logDir = path.join(this.workspacePath, 'superconductor', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
        }
        this.logFile = path.join(logDir, 'yolo-audit.log');
    }

    public init() {
        if (this.initialized) return;

        try {
            const fd = fs.openSync(this.logFile, fs.constants.O_CREAT | fs.constants.O_APPEND);
            fs.fchmodSync(fd, 0o600);
            fs.closeSync(fd);
        } catch (e: any) {
            throw new Error(`Failed to secure audit log file: ${e.message}`);
        }

        const stats = fs.statSync(this.logFile);
        if ((stats.mode & 0o077) !== 0) {
            throw new Error(`FATAL: Audit log file ${this.logFile} has excessive permissions. Permissions must be strictly 0o600.`);
        }

        this.initialized = true;
    }

    public logToolCall(tool: string, args: any, sessionId: string) {
        this.init();
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
        this.init();
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
