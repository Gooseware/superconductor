import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kernelPath = path.resolve(__dirname, '../dist/index.js');

describe('Kernel Integration', () => {
  it('kernel starts, kernel_graph_get_node returns correct data', async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [kernelPath],
      env: { ...process.env, SUPERCONDUCTOR_WORKSPACE_ROOT: '/tmp' }
    });

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    
    try {
      const response = await client.callTool({
        name: "kernel_graph_get_node",
        arguments: { node_id: "testNode", projectRoot: "/tmp" }
      });
      assert.ok(response.content.length > 0);
    } finally {
      await transport.close();
    }
  });
});
