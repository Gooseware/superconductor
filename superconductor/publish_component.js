import fs from 'fs/promises';
import { RegistryClientRouter } from './registry_client_router.js';

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.error('Usage: node publish_component.js <path_to_payload_json>');
    process.exit(1);
  }

  try {
    const payloadContent = await fs.readFile(payloadPath, 'utf-8');
    const payload = JSON.parse(payloadContent);

    // If Caduceus is not available, router will fall back to DesignOS client.
    // We throw a clear error asking the runner to use MCP directly if fallback occurs.
    const router = new RegistryClientRouter({
      executor: () => {
        throw new Error('DesignOS MCP executor not available in CLI process. Please run the MCP tool mcp_design-os-kernel_publish_vetted_component directly.');
      }
    });

    console.log(`[Publish] Publishing component '${payload.metadata?.name}'...`);
    const result = await router.publishComponent(payload);

    if (result.success) {
      console.log(`✅ Success: Component published to ${result.path || 'registry'}`);
    } else {
      console.error('❌ Failure: Component publication failed');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
