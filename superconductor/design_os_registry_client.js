/**
 * Client for interacting with the centralized Design OS registry.
 */
export class DesignOSRegistryClient {
  /**
   * @param {function(Object): Object} executor - Function that executes MCP tool calls.
   */
  constructor(executor) {
    this.executor = executor;
  }

  /**
   * Publishes a component to the centralized registry.
   * @param {Object} payload - The component payload.
   * @throws {Error} If publication fails.
   */
  publishComponent(payload) {
    try {
      const response = this.executor({
        payload,
      });
      if (!response.success) {
        throw new Error(response.error || 'Unknown error occurred');
      }
      return response;
    } catch (error) {
      throw new Error(`Publication failed: ${error.message}`);
    }
  }
}
