import { ReviewerResponseBroker } from './packages/engine/src/verification/reviewer-response-broker.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

(async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adv-test-'));
  const broker = new ReviewerResponseBroker({ workspaceDir, timeoutMs: 3000 });
  const reviewerId = 'slow-reviewer';

  const dir = path.join(workspaceDir, '.superconductor', 'quorum', reviewerId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'consensus.json');

  const p = broker.aggregate([reviewerId]);

  setTimeout(() => {
      fs.appendFileSync(file, 'Some text\n```json:review-findings\n{"status":');
  }, 500);

  setTimeout(() => {
      fs.appendFileSync(file, '"RESOLVED"}\n```\n');
  }, 1500);

  const results = await p;
  console.log(JSON.stringify(results, null, 2));
})();
