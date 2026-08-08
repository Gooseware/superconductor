const fs = require('fs');
let content = fs.readFileSync('/home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/src/remediation/remediation-orchestrator.test.ts', 'utf8');

// The test 'wires deep research on exhausted retries and populates deepResearchResults'
const testSearchStr = "orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });\n    await tick();\n    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });\n    await tick();\n    orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });\n    await tick();";

const replacementStr = "orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err1', fixDiff: 'diff1' });\n    await tick();\n    orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err2', fixDiff: 'diff2' });\n    await tick();\n    orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err3', fixDiff: 'diff3' });\n    await tick();";

content = content.replace(testSearchStr, replacementStr);

fs.writeFileSync('/home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/src/remediation/remediation-orchestrator.test.ts', content);
