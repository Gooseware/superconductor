/**
 * orchestrate-parse.test.ts
 *
 * TDD tests for unitType tagging in parseAndDispatch() (Phase 1 hardening — Task B).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SwarmOrchestratorCLI } from '../../src/cli/orchestrate.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function writeTopography(topoPath: string) {
    fs.writeFileSync(topoPath, JSON.stringify({
        partitions: [],
        dependencyGraph: []
    }), 'utf8');
}

describe('parseAndDispatch() — unitType tagging', () => {
    let tmpDir: string;
    let topographyPath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrate-parse-test-'));
        topographyPath = path.join(tmpDir, 'topography.json');
        writeTopography(topographyPath);
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should tag canonical Manual Verification lines as unitType VERIFY', async () => {
        const planPath = path.join(tmpDir, 'plan.md');
        fs.writeFileSync(planPath, `# Plan
- [ ] Task: Superconductor - User Manual Verification 'Phase X' — Verify the output meets acceptance criteria
`, 'utf8');

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(1);
        expect(workUnits[0].unitType).toBe('VERIFY');
    });

    it('should tag regular task lines as unitType TASK', async () => {
        const planPath = path.join(tmpDir, 'plan.md');
        fs.writeFileSync(planPath, `# Plan
- [ ] Task: Fix IResearchSource interface to add missing method
`, 'utf8');

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(1);
        expect(workUnits[0].unitType).toBe('TASK');
    });

    it('should NOT tag a task as VERIFY just because the spec contains the word "Verify"', async () => {
        const planPath = path.join(tmpDir, 'plan.md');
        fs.writeFileSync(planPath, `# Plan
- [ ] Task: Verify if the swarm-orchestrate skill triggers correctly on valid inputs
`, 'utf8');

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(1);
        // Only canonical "Superconductor - User Manual Verification" lines are VERIFY
        expect(workUnits[0].unitType).toBe('TASK');
    });

    it('should correctly tag a mix of TASK and VERIFY lines', async () => {
        const planPath = path.join(tmpDir, 'plan.md');
        fs.writeFileSync(planPath, `# Plan
- [ ] Task: Fix IResearchSource [AGENT:agent-fix] [DOMAIN:core]
- [ ] Task: Superconductor - User Manual Verification 'Phase 1' — Check all green
- [ ] Task: Verify if the swarm-orchestrate skill works [AGENT:agent-check] [DOMAIN:core]
`, 'utf8');

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(3);
        expect(workUnits[0].unitType).toBe('TASK');
        expect(workUnits[1].unitType).toBe('VERIFY');
        expect(workUnits[2].unitType).toBe('TASK');
    });

    it('should include unitType on every parsed work unit', async () => {
        const planPath = path.join(tmpDir, 'plan.md');
        fs.writeFileSync(planPath, `# Plan
- [ ] Task: Update the login page [AGENT:agent-ui] [DOMAIN:frontend]
- [ ] Task: Add login endpoint [AGENT:agent-api] [DOMAIN:backend]
`, 'utf8');

        const cli = new SwarmOrchestratorCLI();
        const workUnits = await cli.parseAndDispatch(topographyPath, planPath);

        expect(workUnits).toHaveLength(2);
        for (const wu of workUnits) {
            expect(wu.unitType).toBeDefined();
            expect(['TASK', 'VERIFY']).toContain(wu.unitType);
        }
    });
});
