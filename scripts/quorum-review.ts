import * as fs from 'fs';
import * as path from 'path';
import { LanguageAdapter } from '../packages/superconductor-core/src/swarm/LanguageAdapter.js';
import { RemediatorPromptBuilder } from '../packages/superconductor-core/src/swarm/RemediatorPromptBuilder.js';

export type QuorumState = 'IDLE' | 'REVIEW_PENDING' | 'ANALYSIS' | 'REMEDIATION_REQUIRED' | 'APPROVED' | 'FAILED' | 'REQUIRES_HUMAN_INTERVENTION';

export interface QuorumData {
  state: QuorumState;
  loops: number;
  findings: string[];
}

const MAX_QUORUM_LOOPS = 3;
const PROJECT_ROOT = process.cwd();
const STATE_DIR = path.join(PROJECT_ROOT, 'superconductor', 'logs');
const STATE_FILE = path.join(STATE_DIR, 'quorum-state.json');

export function readState(): QuorumData {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return { state: 'IDLE', loops: 0, findings: [] };
}

export function writeState(data: QuorumData) {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  const tmpFile = STATE_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, STATE_FILE);
}

export async function invoke_subagent(prompt: any) {
  // Stub for parallel dispatch
  console.log('Invoking subagent with prompt:', prompt);
}

export async function runQuorum() {
  let data = readState();

  if (data.state === 'REQUIRES_HUMAN_INTERVENTION' || data.state === 'APPROVED' || data.state === 'FAILED') {
    console.log(`Quorum is in terminal state: ${data.state}`);
    return;
  }

  if (data.loops >= MAX_QUORUM_LOOPS) {
    data.state = 'REQUIRES_HUMAN_INTERVENTION';
    writeState(data);
    console.log('MAX_QUORUM_LOOPS exceeded. Halting.');
    return;
  }

  const profile = LanguageAdapter.detect(PROJECT_ROOT);

  if (data.state === 'IDLE' || data.state === 'REVIEW_PENDING') {
    data.state = 'ANALYSIS';
    writeState(data);
  }

  if (data.state === 'ANALYSIS') {
    console.log('Dispatching parallel reviewers: Security + Correctness + Adversarial');
    
    // Simulating findings retrieval
    const newFindings = [`finding_${data.loops}_security`, `finding_${data.loops}_correctness`];
    
    // Deduplication check
    const uniqueNewFindings = newFindings.filter(f => !data.findings.includes(f));
    
    if (uniqueNewFindings.length > 0) {
      data.findings.push(...uniqueNewFindings);
      data.state = 'REMEDIATION_REQUIRED';
      writeState(data);
    } else {
      data.state = 'APPROVED';
      writeState(data);
      console.log('No new findings. APPROVED.');
      return;
    }
  }

  if (data.state === 'REMEDIATION_REQUIRED') {
    data.loops++;
    
    console.log(`Loop ${data.loops}: Dispatching remediators`);
    const domains = ['security', 'correctness', 'adversarial'];
    
    await Promise.all(domains.map(domain => {
      const prompt = RemediatorPromptBuilder.build(profile, domain, `Fix ${domain} findings`, '.');
      return invoke_subagent(prompt);
    }));
    
    data.state = 'REVIEW_PENDING';
    writeState(data);
    
    // Run next loop
    await runQuorum();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQuorum().catch(console.error);
}
