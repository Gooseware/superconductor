import * as crypto from 'node:crypto';

export class StagnantDiffDetector {
  static hashDiff(diff: string): string {
    return crypto.createHash('sha256').update(diff).digest('hex');
  }

  static isStagnant(currentHash: string, previousHash: string | null): boolean {
    if (!previousHash) return false;
    return currentHash === previousHash;
  }
}
