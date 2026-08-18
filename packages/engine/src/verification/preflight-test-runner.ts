import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TestReport } from './test-report.js';

export interface PreflightTestRunnerOptions {
    timeoutMs?: number;
    projectRoot?: string;
}

export class PreflightTestRunner {
    private timeoutMs: number;
    private projectRoot: string;
    private static cache = new Map<string, TestReport>();

    constructor(options: PreflightTestRunnerOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? 120000;
        this.projectRoot = options.projectRoot ?? process.cwd();
    }

    public clearCache(): void {
        PreflightTestRunner.cache.clear();
    }

    private detectTestCommand(pkgJson: any): string {
        const scripts = pkgJson?.scripts || {};
        if (scripts.test) return 'npm run test';
        if (scripts.vitest) return 'npm run vitest';
        if (scripts.jest) return 'npm run jest';
        return 'npm test';
    }

    private detectBuildCommand(pkgJson: any): string {
        const scripts = pkgJson?.scripts || {};
        if (scripts.build) return 'npm run build';
        if (scripts.typecheck) return 'npm run typecheck';
        if (scripts.tsc) return 'npm run tsc';
        return 'npm run build';
    }

    private async runCommand(cmd: string, timeoutMs: number): Promise<{ exitCode: number; output: string }> {
        return new Promise((resolve) => {
            const parts = cmd.split(' ');
            const command = parts[0];
            const args = parts.slice(1);

            const proc = child_process.spawn(command, args, {
                cwd: this.projectRoot,
                shell: true
            });

            let output = '';
            
            proc.stdout?.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr?.on('data', (data) => {
                output += data.toString();
            });

            let timeoutHandle: NodeJS.Timeout;
            let finished = false;

            const finish = (code: number, finalOutput: string) => {
                if (finished) return;
                finished = true;
                clearTimeout(timeoutHandle);
                
                if (finalOutput.length > 8000) {
                    finalOutput = finalOutput.substring(finalOutput.length - 8000);
                }
                
                resolve({ exitCode: code, output: finalOutput });
            };

            timeoutHandle = setTimeout(() => {
                output += '\n[Error: Timeout exceeded]';
                proc.kill('SIGTERM');
                finish(-1, output);
            }, timeoutMs);

            proc.on('close', (code, signal) => {
                finish(code ?? (signal ? -1 : 0), output);
            });
            
            proc.on('error', (err) => {
                finish(-1, output + '\n' + err.message);
            });
        });
    }

    private getTreeHash(): string {
        try {
            return child_process.execSync('git rev-parse HEAD:', {
                cwd: this.projectRoot,
                encoding: 'utf8'
            }).trim();
        } catch (e) {
            return Date.now().toString(); // fallback if not in git repo
        }
    }

    public async run(): Promise<TestReport> {
        const hash = this.getTreeHash();
        if (PreflightTestRunner.cache.has(hash)) {
            return PreflightTestRunner.cache.get(hash)!;
        }

        const pkgPath = path.join(this.projectRoot, 'package.json');
        let pkgJson = {};
        if (fs.existsSync(pkgPath)) {
            try {
                pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            } catch (e) {}
        }

        const testCommand = this.detectTestCommand(pkgJson);
        const buildCommand = this.detectBuildCommand(pkgJson);

        const startTime = Date.now();

        const testResult = await this.runCommand(testCommand, this.timeoutMs);
        const buildResult = await this.runCommand(buildCommand, this.timeoutMs);

        const durationMs = Date.now() - startTime;
        const passed = testResult.exitCode === 0 && buildResult.exitCode === 0;

        const report: TestReport = {
            timestamp: startTime,
            testCommand,
            buildCommand,
            testExitCode: testResult.exitCode,
            buildExitCode: buildResult.exitCode,
            testOutput: testResult.output,
            buildOutput: buildResult.output,
            passed,
            durationMs
        };

        PreflightTestRunner.cache.set(hash, report);
        return report;
    }
}
