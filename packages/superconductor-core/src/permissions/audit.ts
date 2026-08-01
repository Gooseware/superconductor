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
}
