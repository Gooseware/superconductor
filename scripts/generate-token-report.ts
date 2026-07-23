import * as path from 'node:path';
import {
  recordTokenUsage,
  generateTokenReport,
  type TokenEntry
} from '../packages/superconductor-core/dist/review/generate-token-report.js';

export {
  recordTokenUsage,
  generateTokenReport,
  type TokenEntry
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const reportPath = process.argv[2] ? path.resolve(process.argv[2]) : 'token-usage.json';
  const result = generateTokenReport(reportPath);
  console.log(result);
}

