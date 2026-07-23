import {
  runCascadeDeferralGate,
  type DeferralGateResult
} from '../packages/superconductor-core/dist/review/cascade-deferral-gate.js';

export {
  runCascadeDeferralGate,
  type DeferralGateResult
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const totalReviewers = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  const result = runCascadeDeferralGate([], totalReviewers);
  console.log(JSON.stringify(result, null, 2));
}

