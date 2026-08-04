const fs = require('fs');

// Fix research-executor.test.ts
let testFile = fs.readFileSync('packages/engine/src/research/research-executor.test.ts', 'utf8');
testFile = testFile.replace(
    /existsSync: vi\.fn\(\)\.mockReturnValue\(true\),/,
    `existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),`
);
testFile = testFile.replace(
    /process\.env\.GCP_PROJECT_ID = 'test-project';/,
    `process.env.GCP_PROJECT_ID = 'test-project';
        process.env.GEMINI_API_KEY = 'test-key';`
);
fs.writeFileSync('packages/engine/src/research/research-executor.test.ts', testFile);

// Fix provider-registry.test.ts
let regTest = fs.readFileSync('packages/engine/tests/research/provider-registry.test.ts', 'utf8');
regTest = regTest.replace(
    /it\('should return GeminiAPIProvider when "gemini_api_deep_research" is requested', \(\) => \{[\s\S]*?\}\);/,
    `it('should return GeminiApiDeepResearchProvider when "gemini_api_deep_research" is requested', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const registry = new ResearchProviderRegistry();
    const provider = registry.resolve('gemini_api_deep_research');
    expect(provider).toBeInstanceOf(GeminiApiDeepResearchProvider);
  });`
);
// Import GeminiApiDeepResearchProvider if not imported
if (!regTest.includes('GeminiApiDeepResearchProvider')) {
    regTest = `import { GeminiApiDeepResearchProvider } from '../../src/research/providers/gemini-api-deep-research-provider.js';\n` + regTest;
}
fs.writeFileSync('packages/engine/tests/research/provider-registry.test.ts', regTest);
