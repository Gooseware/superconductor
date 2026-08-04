const fs = require('fs');

// 1. Fix agent-config-reader.ts
let configReader = fs.readFileSync('packages/engine/src/research/agent-config-reader.ts', 'utf8');
// Remove replace(/-/g, '_')
configReader = configReader.replace("providerName = providerName.replace(/-/g, '_');", "");
// fs safety (read)
configReader = configReader.replace(
    "const content = fs.readFileSync(configPath, 'utf8');",
    `let content = '';
        try {
            content = fs.readFileSync(configPath, 'utf8');
        } catch (e: any) {
            if (e.code === 'ENOENT' || e.code === 'EISDIR') {
                return undefined;
            }
            throw e;
        }`
);
// authMode runtime validation
configReader = configReader.replace(
    "options.authMode = authModeMatch[1].trim() as 'apiKey' | 'vertexai';",
    `const mode = authModeMatch[1].trim();
            if (mode !== 'apiKey' && mode !== 'vertexai') {
                throw new Error("Invalid authMode: must be 'apiKey' or 'vertexai'");
            }
            options.authMode = mode as 'apiKey' | 'vertexai';`
);
fs.writeFileSync('packages/engine/src/research/agent-config-reader.ts', configReader);

// 2. Fix provider-registry.ts
let providerRegistry = fs.readFileSync('packages/engine/src/research/provider-registry.ts', 'utf8');
providerRegistry = providerRegistry.replace(
    /if \(providerName === 'gemini_api_deep_research'\) {\s*return new GeminiAPIProvider\(options\);\s*}/g,
    `if (providerName === 'gemini_api_deep_research' || providerName === 'gemini-api-deep-research') {
      return new GeminiApiDeepResearchProvider(options);
    }`
);
providerRegistry = providerRegistry.replace(
    /if \(providerName === 'gemini-api-deep-research'\) {\s*return new GeminiApiDeepResearchProvider\(options\);\s*}/g,
    ``
);
providerRegistry = providerRegistry.replace(
    /if \(providerName === 'vertex-ai-deep-research'\) {\s*return new VertexAiDeepResearchProvider\(options\);\s*}/g,
    `if (providerName === 'vertex_ai_deep_research' || providerName === 'vertex-ai-deep-research') {
      return new VertexAiDeepResearchProvider(options);
    }`
);
fs.writeFileSync('packages/engine/src/research/provider-registry.ts', providerRegistry);

// 3. Fix research-executor.ts
let researchExecutor = fs.readFileSync('packages/engine/src/research/research-executor.ts', 'utf8');
// Path sanitization
researchExecutor = researchExecutor.replace(
    "const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '');",
    `const safeTrackId = trackId.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!safeTrackId) {
            throw new Error('Invalid trackId: trackId must contain valid characters after sanitization');
        }`
);
// FS Write safety
researchExecutor = researchExecutor.replace(
    /if \(!fs.existsSync\(outDir\)\) \{\s*fs.mkdirSync\(outDir, \{ recursive: true \}\);\s*\}/g,
    `if (fs.existsSync(outDir)) {
                if (!fs.statSync(outDir).isDirectory()) {
                    throw new Error(\`ENOTDIR: not a directory, open '\${outDir}'\`);
                }
            } else {
                fs.mkdirSync(outDir, { recursive: true });
            }`
);
fs.writeFileSync('packages/engine/src/research/research-executor.ts', researchExecutor);

// 4. Fix research-executor.test.ts
let testFile = fs.readFileSync('packages/engine/src/research/research-executor.test.ts', 'utf8');
// Wait, the "missing }); that caused test nesting" - actually looking at the file it wasn't nested. 
// But let's replace the last test.
testFile = testFile.replace(
    /it\('instantiates the new provider end-to-end from agent-config\.md', async \(\) => \{[\s\S]*\}\);\s*\}\);/g,
    `it('instantiates the new provider end-to-end from agent-config.md', async () => {
        const executor = new ResearchExecutor(workspaceDir);
        const mockCacheGet = vi.fn().mockResolvedValue(null);
        (executor as any).cache = { get: mockCacheGet, set: vi.fn() };
        
        vi.mocked(fs.readFileSync).mockImplementation((p) => {
            if (p.toString().includes('agent-config.md')) {
                return 'Research Provider: gemini-api-deep-research\\nAuth Mode: vertexai';
            }
            return '';
        });

        process.env.GCP_PROJECT_ID = 'test-project';
        const resolveSpy = vi.spyOn(ResearchProviderRegistry.prototype, 'resolve');
        
        // Remove GeminiAPIProvider mock and mock the new one instead
        const { GeminiApiDeepResearchProvider } = await import('./providers/gemini-api-deep-research-provider.js');
        const mockSearch = vi.fn().mockResolvedValue([{ type: 'community', url: 'https://stackoverflow.com/questions/123', title: 'test', content: 'content' }]);
        vi.spyOn(GeminiApiDeepResearchProvider.prototype, 'search').mockImplementation(mockSearch);

        const queries = [{ term: 'q1' }];
        await executor.execute('t1', queries, undefined);
        
        expect(resolveSpy).toHaveBeenCalledWith('gemini-api-deep-research', { authMode: 'vertexai' });
        
        // Assert that the factory actually instantiates the correct new provider instance
        const returnedProvider = resolveSpy.mock.results[0].value;
        expect(returnedProvider).toBeInstanceOf(GeminiApiDeepResearchProvider);
    });
});`
);
// Also need to add GeminiApiDeepResearchProvider import at top if needed, but we used await import.
fs.writeFileSync('packages/engine/src/research/research-executor.test.ts', testFile);
