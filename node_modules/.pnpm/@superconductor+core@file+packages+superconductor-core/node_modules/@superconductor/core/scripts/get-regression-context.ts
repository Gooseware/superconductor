#!/usr/bin/env npx tsx
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0];

function getDetailedDeletions() {
  try {
    const diff = execSync('git diff -U5 HEAD', { encoding: 'utf-8' });
    const deletions = diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'));
    console.log(deletions.join('\n'));
  } catch (error) {
    console.error('Failed to get diff:', error);
  }
}

function getCommitHistory(file: string) {
  try {
    const log = execSync(`git log -p -2 ${file}`, { encoding: 'utf-8' });
    console.log(log);
  } catch (error) {
    console.error('Failed to get history:', error);
  }
}

if (command === 'diff') {
  getDetailedDeletions();
} else if (command === 'history' && args[1]) {
  getCommitHistory(args[1]);
} else {
  console.log(`Usage: 
  get-regression-context diff
  get-regression-context history <file_path>`);
}
