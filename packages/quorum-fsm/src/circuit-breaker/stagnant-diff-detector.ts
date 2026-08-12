import * as crypto from 'node:crypto';

export class StagnantDiffDetector {
  static hashDiff(diff: string): string {
    const normalized = diff
      .replace(/^@@.*@@/gm, '')
      .replace(/^\+.*(19|20)\d{2}.*/gm, '')
      .replace(/\s+/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  static isStagnant(currentHash: string, previousHash: string | null): boolean {
    if (!previousHash) return false;
    return currentHash === previousHash;
  }
}
