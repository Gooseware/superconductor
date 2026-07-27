import fs from 'fs';
import path from 'path';

export class TaskLockManager {
    private lockDir: string;

    constructor(lockDir?: string) {
        if (!lockDir) {
            lockDir = process.env.NODE_ENV === 'test'
                ? `.superconductor/locks_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
                : '.superconductor/locks';
        }
        this.lockDir = path.resolve(process.cwd(), lockDir);
        if (!fs.existsSync(this.lockDir)) {
            fs.mkdirSync(this.lockDir, { recursive: true });
        }
    }

    private getLockFilePath(taskId: string): string {
        const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.lockDir, `${safeId}.lock`);
    }

    public async acquireLock(taskId: string, agentId: string): Promise<boolean> {
        const lockFile = this.getLockFilePath(taskId);
        try {
            fs.writeFileSync(lockFile, agentId, { flag: 'wx' });
            return true;
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                return false;
            }
            throw error;
        }
    }

    public async releaseLock(taskId: string, agentId: string): Promise<boolean> {
        const lockFile = this.getLockFilePath(taskId);
        try {
            if (!fs.existsSync(lockFile)) {
                return false;
            }
            const currentHolder = fs.readFileSync(lockFile, 'utf8');
            if (currentHolder === agentId) {
                fs.unlinkSync(lockFile);
                return true;
            }
            return false;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return false;
            }
            throw error;
        }
    }

    public getLockHolder(taskId: string): string | null {
        const lockFile = this.getLockFilePath(taskId);
        if (fs.existsSync(lockFile)) {
            return fs.readFileSync(lockFile, 'utf8');
        }
        return null;
    }
}
