export class SwarmAuthorizer {
  /**
   * Generates a Swarm-Authorized trailer to append to a commit message.
   * Cleanly formats 1 to 5 reviewer conversation IDs (typically 4 to 5 for standard/full quorum).
   *
   * @param reviewerConvIds The conversation IDs of the reviewers who authorized this track.
   * @returns The formatted trailer string.
   */
  static generateTrailer(reviewerConvIds: string[]): string {
    if (!reviewerConvIds || !Array.isArray(reviewerConvIds)) {
      throw new Error("Cannot generate Swarm-Authorized trailer without reviewer IDs.");
    }

    for (const rawId of reviewerConvIds) {
      if (typeof rawId === 'string' && /[\r\n,]/.test(rawId)) {
        throw new Error(
          `Invalid reviewer ID "${rawId}": reviewer IDs must match /^[a-zA-Z0-9_\\-\\.]+$/ and cannot contain newlines or commas.`
        );
      }
    }

    const cleanIds = reviewerConvIds
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => id.length > 0);

    if (cleanIds.length === 0) {
      throw new Error("Cannot generate Swarm-Authorized trailer without reviewer IDs.");
    }

    if (cleanIds.length > 5) {
      throw new Error("Cannot generate Swarm-Authorized trailer with more than 5 reviewers.");
    }

    const VALID_ID_REGEX = /^[a-zA-Z0-9_\-\.]+$/;
    for (const id of cleanIds) {
      if (id.includes('\r') || id.includes('\n') || id.includes(',') || !VALID_ID_REGEX.test(id)) {
        throw new Error(
          `Invalid reviewer ID "${id}": reviewer IDs must match /^[a-zA-Z0-9_\\-\\.]+$/ and cannot contain newlines or commas.`
        );
      }
    }

    const ids = cleanIds.join(',');
    return `Swarm-Authorized: true | reviewers: ${ids}`;
  }

  /**
   * Extracts and parses reviewer conversation IDs from a commit message.
   * Validates that the trailer contains between 1 and 5 reviewer IDs,
   * tolerating trailing spaces and newlines.
   *
   * @param commitMsg The full commit message.
   * @returns Array of 1 to 5 reviewer IDs if valid, or null otherwise.
   */
  static extractReviewers(commitMsg: string): string[] | null {
    if (!commitMsg || typeof commitMsg !== 'string') return null;

    const regex = /(?:^|\r?\n)Swarm-Authorized:\s*true\s*\|\s*reviewers:\s*([^\r\n]+?)\s*(?:\r?\n\s*)*$/;
    const match = commitMsg.match(regex);
    if (!match) return null;

    const ids = match[1]
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length < 1 || ids.length > 5) {
      return null;
    }

    return ids;
  }

  /**
   * Validates if a commit message contains a valid Swarm-Authorized trailer
   * with 1 to 5 reviewer conversation IDs.
   * Accurately parses trailers even with trailing spaces and newlines.
   *
   * @param commitMsg The full commit message.
   * @returns True if a valid trailer is present, false otherwise.
   */
  static validateTrailer(commitMsg: string): boolean {
    return this.extractReviewers(commitMsg) !== null;
  }
}
