import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function runAudit() {
  console.log('--- Swarm Compliance Audit ---');
  let commits: string[] = [];
  try {
    const output = execSync('git log --format="%H" -- ":/packages/*/src/**"', { encoding: 'utf-8' });
    commits = output.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (error) {
    console.error('Failed to get git log');
    return;
  }

  let compliantCount = 0;
  const violations: { hash: string, subject: string }[] = [];

  for (const hash of commits) {
    const msg = execSync(`git log -1 --format="%B" ${hash}`, { encoding: 'utf-8' });
    if (msg.includes('Swarm-Authorized: true')) {
      compliantCount++;
    } else {
      const subject = execSync(`git log -1 --format="%s" ${hash}`, { encoding: 'utf-8' }).trim();
      violations.push({ hash, subject });
    }
  }

  console.log(`Analyzed ${commits.length} commits touching packages/*/src/`);
  console.log(`Compliant commits: ${compliantCount}`);
  
  if (violations.length > 0) {
    console.log(`\nViolations found (${violations.length}):`);
    violations.forEach(v => {
      console.log(`- ${v.hash.substring(0, 7)}: ${v.subject}`);
    });
  } else {
    console.log('\nNo violations found.');
  }

  try {
    const rootDir = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
    const logPath = path.join(rootDir, 'superconductor', 'swarm_compliance.log');
    if (fs.existsSync(logPath)) {
      console.log('\n--- Bypass Events (Needs Human Review) ---');
      const logContent = fs.readFileSync(logPath, 'utf-8');
      console.log(logContent.trim());
    } else {
      console.log('\nNo bypass events logged.');
    }
  } catch (e) {
    console.log('\nFailed to check bypass events log.');
  }
}

// In Vitest environments, require.main is usually undefined or different, 
// but checking process.env.NODE_ENV is safer to avoid running it during imports.
if (process.env.NODE_ENV !== 'test') {
  runAudit();
}
