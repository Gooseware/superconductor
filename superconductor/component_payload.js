/**
 * Standardized payload for component publication.
 */
export class ComponentPayload {
  /**
   * @param {Object} data - Payload data.
   * @param {Array} data.files - List of {path, content} objects.
   * @param {Object} data.metadata - Component metadata.
   * @param {Array} [data.comments] - Optional comments.
   * @param {Array} [data.dependencies] - Optional dependencies.
   */
  constructor(data) {
    this.files = data.files;
    this.metadata = data.metadata;
    this.comments = data.comments || [];
    this.dependencies = data.dependencies || [];
  }

  /**
   * Validates the payload.
   * @throws {Error} If required fields are missing.
   */
  validate() {
    const missing = [];
    if (!this.files) missing.push('files');
    if (!this.metadata) missing.push('metadata');
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }
}
