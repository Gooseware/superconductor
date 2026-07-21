import { CaduceusRegistryClient } from './caduceus_registry_client.js';
import { DesignOSRegistryClient } from './design_os_registry_client.js';

/**
 * Unified Router to route component publications to either the local Caduceus
 * Golden Component library or fallback to Design OS kernel.
 */
export class RegistryClientRouter {
  /**
   * @param {function(Object): Object} executor - Executor function for Design OS MCP tools fallback.
   * @param {string} [caduceusLibraryRoot] - Override path to Caduceus library.
   */
  constructor(executor, caduceusLibraryRoot) {
    this.caduceusClient = new CaduceusRegistryClient(caduceusLibraryRoot);
    this.designOSClient = new DesignOSRegistryClient(executor);
  }

  /**
   * Publishes the component. Routes to Caduceus if available, otherwise Design OS.
   * @param {Object} payload - Component payload.
   * @returns {Promise<Object>} The publication results.
   */
  async publishComponent(payload) {
    const isCaduceusAvailable = await this.caduceusClient.isAvailable();
    
    if (isCaduceusAvailable) {
      console.log(`[RegistryRouter] Caduceus Registry detected. Routing publication of '${payload.metadata.name}' to Caduceus.`);
      return await this.caduceusClient.publishComponent(payload);
    } else {
      console.log(`[RegistryRouter] Caduceus Registry not found. Falling back to Design OS MCP publication of '${payload.metadata.name}'.`);
      // Since designOSClient.publishComponent is synchronous in the original codebase, we wrap it
      return this.designOSClient.publishComponent(payload);
    }
  }
}
