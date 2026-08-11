import * as crypto from 'node:crypto';

export interface ZeroBiasContext {
  diff: string;
  preflight_output: string;
  finding_fingerprints: string[];
  cycle_number: number;
}

export class ZeroBiasContextBuilder {
  static build(params: {
    diff: string;
    preflight_output: string;
    prior_findings: string[];
    cycle: number;
  }): ZeroBiasContext {
    return {
      diff: params.diff,
      preflight_output: params.preflight_output,
      finding_fingerprints: params.prior_findings.map((f) =>
        crypto.createHash('sha256').update(f).digest('hex')
      ),
      cycle_number: params.cycle,
    };
  }
}
