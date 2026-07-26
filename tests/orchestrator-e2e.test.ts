import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { DaemonHeartbeat } from '../packages/engine/src/concurrency/daemon-heartbeat';
import { QuorumReviewLoop } from '../packages/engine/src/verification/quorum-review-loop';
import { CodebaseChunker } from '../packages/superconductor-core/src/intelligence/codebase-chunker';
import { DependencyAnalyzer } from '../packages/superconductor-core/src/intelligence/dependency-analyzer';
import { IntelligenceSnapshotReader } from '../packages/superconductor-core/src/intelligence/snapshot-reader';

async function runE2ESmokeTests() {
  console.log('Running Phase 5 E2E Smoke Tests for Orchestrator & Self-Healing');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-orchestrator-e2e-'));

  try {
    // AC1: Recovery Daemon re-injects plan.md
    console.log('Test AC1: Recovery Daemon');
    fs.writeFileSync(path.join(tmpDir, 'plan.md'), 'MOCK_PLAN_CONTENT');
    const engineState: any = { context: undefined };
    
    let escalated = false;
    const daemon = new DaemonHeartbeat(1000, undefined, { maxRetries: 1, onEscalate: () => { escalated = true; } });
    
    daemon.verifyTrackContext(engineState, tmpDir);
    assert.strictEqual(engineState.context, 'MOCK_PLAN_CONTENT', 'Daemon failed to inject plan.md');
    
    engineState.context = undefined;
    daemon.verifyTrackContext(engineState, tmpDir); // retry 1
    engineState.context = undefined;
    daemon.verifyTrackContext(engineState, tmpDir); // retry 2 (escalate)
    assert.strictEqual(escalated, true, 'Daemon failed to escalate after max retries');
    console.log('✅ AC1 Passed');

    // AC2: Quorum Review Loop enters remediation
    console.log('Test AC2: Quorum Review Loop');
    let reviewCount = 0;
    let remediateCount = 0;
    const loop = new QuorumReviewLoop({
      maxIterations: 3,
      reviewerFn: async (code) => {
        reviewCount++;
        if (reviewCount < 2) return { status: 'REJECTED', findings: ['Mock violation'] };
        return { status: 'RESOLVED', findings: [] };
      },
      remediateFn: async (code, findings) => {
        remediateCount++;
        return code + '_remediated';
      }
    });

    const finalResult = await loop.run('initial_code');
    assert.strictEqual(reviewCount, 2, 'Review loop should have run twice');
    assert.strictEqual(remediateCount, 1, 'Remediation should have run once');
    assert.strictEqual(finalResult.status, 'RESOLVED');
    console.log('✅ AC2 Passed');

    // AC3: Codebase Chunking logic
    console.log('Test AC3: Codebase Chunking by dependency edges');
    const files = [
      { path: 'a.ts', size: 50000, imports: ['b.ts'] },
      { path: 'b.ts', size: 60000, imports: [] },
      { path: 'c.ts', size: 10000, imports: [] }
    ];
    for (const f of files) {
      fs.writeFileSync(path.join(tmpDir, f.path), 'export const a = 1;'); 
    }
    
    const analyzer = new DependencyAnalyzer(tmpDir);
    analyzer['fileReader'] = (p) => 'export const a = 1;';
    
    analyzer.buildGraph = () => {
      analyzer['graph'] = new Map([
        ['a.ts', ['b.ts']],
        ['b.ts', []],
        ['c.ts', []]
      ]);
    };
    analyzer.buildGraph();

    const tokenCounter = (text: string) => {
        return text.length; 
    };

    const chunker = new CodebaseChunker(analyzer, tokenCounter, 100000); 
    chunker['tokenCounter'] = (text: string) => {
        return 60000;
    };
    
    const chunks = await chunker.chunkFiles(files.map(f => path.join(tmpDir, f.path)));
    assert.ok(chunks.length >= 2, 'Chunks should be partitioned based on size and edges');
    console.log('✅ AC3 Passed');

    // AC4: Synthetic Onboarding Generator
    console.log('Test AC4: Synthetic context generation and secret scrubbing');
    fs.mkdirSync(path.join(tmpDir, 'superconductor'), { recursive: true });
    
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'Welcome to Test Product\nDB_URL=12345');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ dependencies: { "react": "^18.0.0" } }));
    
    IntelligenceSnapshotReader.generateSyntheticContext(tmpDir);
    
    const productMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'product.md'), 'utf-8');
    const techStackMd = fs.readFileSync(path.join(tmpDir, 'superconductor', 'tech-stack.md'), 'utf-8');
    
    assert.ok(productMd.includes('Test Product'), 'product.md should contain vision from README');
    assert.ok(!productMd.includes('DB_URL=12345'), 'product.md should be scrubbed of secrets');
    assert.ok(productMd.includes('DB_URL=***'), 'product.md should show scrubbed placeholder');
    
    assert.ok(techStackMd.includes('React'), 'tech-stack.md should have React stack info from package.json');
    
    console.log('✅ AC4 Passed');

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\nAll tests passed successfully.');
}

runE2ESmokeTests().catch(e => {
  console.error('Smoke tests failed:', e);
  process.exit(1);
});
