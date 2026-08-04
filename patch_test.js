const fs = require('fs');
const content = fs.readFileSync('packages/engine/src/research/research-executor.test.ts', 'utf8');

let newContent = content.replace(
    'writeFileSync: vi.fn()',
    "writeFileSync: vi.fn(), readFileSync: vi.fn().mockReturnValue('')"
);

const testStr = `
    it('instantiates the new provider end-to-end from agent-config.md', async () => {
        const executor = new ResearchExecutor(workspaceDir);
        const mockCacheGet = vi.fn().mockResolvedValue(null);
        (executor as any).cache = { get: mockCacheGet, set: vi.fn() };
        
        // Mock the fs.readFileSync specifically for agent-config.md
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
            if (p.toString().includes('agent-config.md')) {
                return 'Research Provider: gemini-api-deep-research\\nAuth Mode: vertexai';
            }
            return '';
        });

        // Set env vars to avoid crash in GeminiInteractionsClient
        process.env.GCP_PROJECT_ID = 'test-project';

        const queries = [{ term: 'q1' }];
        
        try {
            // We pass undefined for provider, so it should read config and instantiate GeminiAPIProvider
            // But search will throw because it tries to call real APIs, so we mock the provider registry or catch error.
            // Wait, we can't easily assert the instantiated provider without spying on Registry.
            // Let's spy on ResearchProviderRegistry.
        } catch(e) {}
    });
});
`;

newContent = newContent.replace('});\n', testStr);
fs.writeFileSync('packages/engine/src/research/research-executor.test.ts', newContent);
