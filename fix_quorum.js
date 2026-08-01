const fs = require('fs');

let code = fs.readFileSync('scripts/quorum-review.ts', 'utf8');

// 1. implement loadState
code = code.replace(/constructor\(private targetFile: string\) \{\}/, `constructor(private targetFile: string) { this.loadState(); }

    private loadState() {
        const stateFile = require('node:path').join(process.cwd(), 'superconductor/logs/quorum-state.json');
        if (require('node:fs').existsSync(stateFile)) {
            try {
                const data = require('node:fs').readFileSync(stateFile, 'utf8');
                this.stateData = JSON.parse(data);
            } catch (err) {
                console.error("Failed to load state", err);
            }
        }
    }`);

// 2. implement explicit switch-case in transition
code = code.replace(/public transition\(newState: FSMState\) \{\n\s*this\.stateData\.state = newState;\n\s*this\.persistState\(\);\n\s*\}/, `public transition(newState: FSMState) {
        switch (newState) {
            case 'IDLE':
            case 'REVIEW_PENDING':
            case 'ANALYSIS':
            case 'REMEDIATION_REQUIRED':
            case 'APPROVED':
            case 'FAILED':
            case 'REQUIRES_HUMAN_INTERVENTION':
                this.stateData.state = newState;
                break;
            default:
                throw new Error(\`Invalid FSM transition: \${newState}\`);
        }
        this.persistState();
    }`);

// 3. remove early return and re-enter REVIEW_PENDING
code = code.replace(/\/\/ Halt FSM - do NOT continue looping\n\s*return \{ status: 'REMEDIATION_REQUIRED', findings: this\.stateData\.findings \};\n\s*\}/, `// Wait for all remediators to complete before re-entering REVIEW_PENDING
            this.transition('REVIEW_PENDING');
        }`);

// 4. Fix Argument Injection (use --)
code = code.replace(/execFileAsync\('antigravity', \['--skill', reviewer, '--file', this\.targetFile\]\)/g, `execFileAsync('antigravity', ['--skill', reviewer, '--file', '--', this.targetFile])`);
code = code.replace(/execFileAsync\('antigravity', \['--skill', 'remediation-processor', '--file', this\.targetFile, '--findings', findingsArg\]\)/g, `execFileAsync('antigravity', ['--skill', 'remediation-processor', '--file', '--', this.targetFile, '--findings', findingsArg])`);

fs.writeFileSync('scripts/quorum-review.ts', code);
