import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export class WorkspaceManager {
    private workspacesDir: string;
    private originRepo: string;

    constructor(originRepo: string = process.cwd(), workspacesDir: string = '.superconductor/workspaces') {
        this.originRepo = originRepo;
        this.workspacesDir = path.resolve(process.cwd(), workspacesDir);
        if (!fs.existsSync(this.workspacesDir)) {
            fs.mkdirSync(this.workspacesDir, { recursive: true });
        }
    }

    public createWorkspace(taskId: string): string {
        const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const workspacePath = path.join(this.workspacesDir, `workspace_${safeId}`);
        
        if (fs.existsSync(workspacePath)) {
            this.cleanupWorkspace(taskId);
        }

        execSync(`git clone ${this.originRepo} ${workspacePath}`, { stdio: 'ignore' });
        return workspacePath;
    }

    public cleanupWorkspace(taskId: string): void {
        const safeId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const workspacePath = path.join(this.workspacesDir, `workspace_${safeId}`);
        
        if (fs.existsSync(workspacePath)) {
            fs.rmSync(workspacePath, { recursive: true, force: true });
        }
    }
}
