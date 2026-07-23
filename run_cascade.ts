import { runCascadeDeferralGate } from './scripts/cascade-deferral-gate.ts';
import * as fs from 'node:fs';

const findings = JSON.parse(fs.readFileSync('aggregated_findings.json', 'utf-8'));
const result = runCascadeDeferralGate(findings, 3);
console.log(JSON.stringify(result, null, 2));
