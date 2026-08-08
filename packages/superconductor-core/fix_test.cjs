const fs = require('fs');
let content = fs.readFileSync('/home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/src/remediation/remediation-orchestrator.test.ts', 'utf8');

content = content.replace(
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });",
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err1', fixDiff: 'diff1' });"
).replace(
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });",
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err2', fixDiff: 'diff2' });"
).replace(
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED' });",
  "orchestrator.handleReviewResult('agent-123', { status: 'FAILED', errorMessage: 'err3', fixDiff: 'diff3' });"
);

content = content.replace(
  "expect(mockEscalationHandler.escalate).toHaveBeenCalled();",
  "expect(mockEscalationHandler.escalate).toHaveBeenCalledWith(expect.objectContaining({ codeContext: 'Simulated context from file', errorMessages: ['err1', 'err2', 'err3'], priorFixDiffs: ['diff1', 'diff2', 'diff3'] }));"
);

fs.writeFileSync('/home/gooseware/repos/gemini/extensions/superconductor/packages/superconductor-core/src/remediation/remediation-orchestrator.test.ts', content);
