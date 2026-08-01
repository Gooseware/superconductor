import fs from 'fs';
import path from 'path';
import { ReviewerResponseBroker } from './packages/engine/dist/verification/reviewer-response-broker.js';
const broker = new ReviewerResponseBroker({ workspaceDir: process.cwd(), timeoutMs: 2000 });

fs.mkdirSync('.superconductor/quorum/rev1', { recursive: true });
const fd = fs.openSync('.superconductor/quorum/rev1/consensus.json', 'w');

broker.aggregate(['rev1']).then(res => console.log('Result:', JSON.stringify(res, null, 2)));

setTimeout(() => {
  fs.writeSync(fd, '```json:review-findings\n{"status": "RE');
  setTimeout(() => {
    fs.writeSync(fd, 'SOLVED"}\n```');
    fs.closeSync(fd);
  }, 500);
}, 500);
