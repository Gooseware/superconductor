export class SwarmAuthorizer {
  /**
   * Generates a Swarm-Authorized trailer to append to a commit message.
   * @param reviewerConvIds The conversation IDs of the reviewers who authorized this track.
   * @returns The formatted trailer string.
   */
  static generateTrailer(reviewerConvIds: string[]): string {
    if (!reviewerConvIds || reviewerConvIds.length === 0) {
      throw new Error("Cannot generate Swarm-Authorized trailer without reviewer IDs.");
    }
    const ids = reviewerConvIds.join(',');
    return `Swarm-Authorized: true | reviewers: ${ids}`;
  }

  /**
   * Validates if a commit message contains a valid Swarm-Authorized trailer.
   * @param commitMsg The full commit message.
   * @returns True if a valid trailer is present, false otherwise.
   */
  static validateTrailer(commitMsg: string): boolean {
    const regex = /Swarm-Authorized:\s*true\s*\|\s*reviewers:\s*([^\n\r]+)$/m;
    const match = commitMsg.match(regex);
    if (!match) return false;
    
    // Ensure there is at least one non-empty ID
    const ids = match[1].split(',').map(id => id.trim()).filter(id => id.length > 0);
    return ids.length > 0;
  }
}
