import { evaluatePhaseGate, PhaseGateInput, PhaseGateResult } from '../review/swarm-phase-gate.js';

export interface PairProgrammingOptions {
  taskSpec: string;
  maxIterations?: number;
  onCodeIteration: (attempt: number) => Promise<{ diff: string; modifiedFiles: string[] }>;
  onReviewIteration: (diff: string, modifiedFiles: string[]) => Promise<{ reviewer_id: string; raw_text: string }[]>;
}

export interface PairProgrammingResult {
  success: boolean;
  finalDiff: string;
  iterations: number;
  gateResult: PhaseGateResult;
}

export async function runPairProgrammingLoop(options: PairProgrammingOptions): Promise<PairProgrammingResult> {
  const maxIterations = options.maxIterations ?? 2;
  let currentDiff = '';
  let currentFiles: string[] = [];
  let gateResult: PhaseGateResult = { status: 'REJECT', advisory_findings: [], critical_findings: [], next_action: 'AUTO_REMEDIATE' };

  for (let attempt = 0; attempt <= maxIterations; attempt++) {
    // Coder step
    const { diff, modifiedFiles } = await options.onCodeIteration(attempt);
    currentDiff = diff;
    currentFiles = modifiedFiles;

    // Reviewer step
    const reviewerOutputs = await options.onReviewIteration(currentDiff, currentFiles);

    const gateInput: PhaseGateInput = {
      reviewerOutputs,
      retryCount: attempt
    };

    gateResult = evaluatePhaseGate(gateInput);

    if (gateResult.status === 'PASS') {
      return {
        success: true,
        finalDiff: currentDiff,
        iterations: attempt + 1,
        gateResult
      };
    } else if (gateResult.status === 'ESCALATE') {
      return {
        success: false,
        finalDiff: currentDiff,
        iterations: attempt + 1,
        gateResult
      };
    }
  }

  return {
    success: false,
    finalDiff: currentDiff,
    iterations: maxIterations + 1,
    gateResult
  };
}
