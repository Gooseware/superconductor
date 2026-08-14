import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ModelCatalogService,
  DEFAULT_BUILTIN_MODELS,
  DEFAULT_CACHE_TTL_MS,
  type DiscoveredModel,
  type ModelCacheData,
} from '../../src/models/model-catalog-service.js';

const MOCK_CLI_OUTPUT = `
⠋ Fetching available models...⠙ Fetching available models...⠹ Fetching available models...
gemini-3.7-flash-high     Gemini 3.7 Flash (High)
gemini-3.7-flash-medium   Gemini 3.7 Flash (Medium)
gemini-3.7-flash-low      Gemini 3.7 Flash (Low)
gemini-3.6-flash-high     Gemini 3.6 Flash (High)
gemini-3.6-flash-medium   Gemini 3.6 Flash (Medium)
gemini-3.6-flash-low      Gemini 3.6 Flash (Low)
gemini-3.5-flash-high     Gemini 3.5 Flash (High)
gemini-3.5-flash-medium   Gemini 3.5 Flash (Medium)
gemini-3.5-flash-low      Gemini 3.5 Flash (Low)
gemini-3.1-pro-high       Gemini 3.1 Pro (High)
gemini-3.1-pro-low        Gemini 3.1 Pro (Low)
claude-sonnet-4-6         Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking  Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium       GPT-OSS 120B (Medium)
`;

const MOCK_ANSI_CLI_OUTPUT = `
\x1b[32m⠋ Fetching available models...\x1b[0m\r\x1b[1mgemini-3.7-flash-high\x1b[0m     \x1b[36mGemini 3.7 Flash (High)\x1b[0m
\x1b[1mclaude-sonnet-4-6\x1b[0m         \x1b[36mClaude Sonnet 4.6 (Thinking)\x1b[0m
`;

describe('ModelCatalogService', () => {
  let tempDir: string;
  let testCachePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-catalog-test-'));
    testCachePath = path.join(tempDir, 'models-cache.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('CLI Output Parsing', () => {
    it('should parse standard agy models stdout into model IDs and display names', () => {
      const models = ModelCatalogService.parseAgyModelsOutput(MOCK_CLI_OUTPUT);
      expect(models).toHaveLength(14);
      expect(models[0]).toEqual({
        id: 'gemini-3.7-flash-high',
        name: 'Gemini 3.7 Flash (High)',
      });
      expect(models[11]).toEqual({
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6 (Thinking)',
      });
      expect(models[12]).toEqual({
        id: 'claude-opus-4-6-thinking',
        name: 'Claude Opus 4.6 (Thinking)',
      });
      expect(models[13]).toEqual({
        id: 'gpt-oss-120b-medium',
        name: 'GPT-OSS 120B (Medium)',
      });
    });

    it('should strip ANSI escape sequences and spinner frames cleanly', () => {
      const models = ModelCatalogService.parseAgyModelsOutput(MOCK_ANSI_CLI_OUTPUT);
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'gemini-3.7-flash-high',
        name: 'Gemini 3.7 Flash (High)',
      });
      expect(models[1]).toEqual({
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6 (Thinking)',
      });
    });

    it('should return empty array for empty or whitespace-only stdout', () => {
      expect(ModelCatalogService.parseAgyModelsOutput('')).toEqual([]);
      expect(ModelCatalogService.parseAgyModelsOutput('   \n\n\t  ')).toEqual([]);
    });

    it('should ignore header/status lines and unparseable lines', () => {
      const noise = `
Fetching available models...
--- Available Models ---
error: cannot reach server
some-id-without-name
`;
      const models = ModelCatalogService.parseAgyModelsOutput(noise);
      expect(models).toEqual([]);
    });

    it('should deduplicate models by ID case-insensitively', () => {
      const dupOutput = `
gemini-3.7-flash-high   Gemini 3.7 Flash (High)
GEMINI-3.7-FLASH-HIGH   Gemini 3.7 Flash (Duplicate)
`;
      const models = ModelCatalogService.parseAgyModelsOutput(dupOutput);
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gemini-3.7-flash-high');
    });
  });

  describe('File Caching & 24-Hour TTL Validity', () => {
    it('should fetch from CLI on first call and create cache file with timestamp', () => {
      let execCount = 0;
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      expect(fs.existsSync(testCachePath)).toBe(false);
      const models = service.getModels();
      expect(models).toHaveLength(14);
      expect(execCount).toBe(1);

      expect(fs.existsSync(testCachePath)).toBe(true);
      const cacheContent: ModelCacheData = JSON.parse(fs.readFileSync(testCachePath, 'utf-8'));
      expect(cacheContent.models).toHaveLength(14);
      expect(typeof cacheContent.timestamp).toBe('number');
      expect(Date.now() - cacheContent.timestamp).toBeLessThan(5000);
    });

    it('should return cached models without executing CLI if cache is within 24hr TTL', () => {
      let execCount = 0;
      const cachedModels: DiscoveredModel[] = [
        { id: 'cached-model-1', name: 'Cached Model 1' },
        { id: 'cached-model-2', name: 'Cached Model 2' },
      ];

      const cacheData: ModelCacheData = {
        timestamp: Date.now() - 1000 * 60 * 60 * 12, // 12 hours old
        models: cachedModels,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(cacheData, null, 2));

      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models = service.getModels();
      expect(models).toEqual(cachedModels);
      expect(execCount).toBe(0);
    });

    it('should re-fetch from CLI and update cache if cache is older than 24 hours (expired TTL)', () => {
      let execCount = 0;
      const oldModels: DiscoveredModel[] = [{ id: 'old-model', name: 'Old Model' }];
      const cacheData: ModelCacheData = {
        timestamp: Date.now() - (DEFAULT_CACHE_TTL_MS + 10000), // > 24 hours old
        models: oldModels,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(cacheData, null, 2));

      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models = service.getModels();
      expect(models).toHaveLength(14);
      expect(execCount).toBe(1);

      const updatedCache: ModelCacheData = JSON.parse(fs.readFileSync(testCachePath, 'utf-8'));
      expect(updatedCache.models).toHaveLength(14);
      expect(Date.now() - updatedCache.timestamp).toBeLessThan(5000);
    });

    it('should correctly evaluate isCacheValid boundary conditions', () => {
      const service = new ModelCatalogService({ cachePath: testCachePath });
      const now = Date.now();

      expect(service.isCacheValid(null)).toBe(false);
      expect(service.isCacheValid({ timestamp: now, models: [] })).toBe(false);

      // Fresh cache (10 minutes old)
      expect(service.isCacheValid({ timestamp: now - 600000, models: [{ id: 'm1', name: 'M1' }] })).toBe(true);

      // Just under 24 hours
      expect(service.isCacheValid({ timestamp: now - (DEFAULT_CACHE_TTL_MS - 5000), models: [{ id: 'm1', name: 'M1' }] })).toBe(true);

      // Just over 24 hours
      expect(service.isCacheValid({ timestamp: now - (DEFAULT_CACHE_TTL_MS + 5000), models: [{ id: 'm1', name: 'M1' }] })).toBe(false);

      // Future timestamp / corrupted
      expect(service.isCacheValid({ timestamp: now + 1000000, models: [{ id: 'm1', name: 'M1' }] })).toBe(false);
    });

    it('should handle corrupted JSON cache files gracefully', () => {
      fs.writeFileSync(testCachePath, '{ invalid json');
      let execCount = 0;
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models = service.getModels();
      expect(models).toHaveLength(14);
      expect(execCount).toBe(1);
    });

    it('should clear cache on clearCache()', () => {
      fs.writeFileSync(testCachePath, JSON.stringify({ timestamp: Date.now(), models: [] }));
      const service = new ModelCatalogService({ cachePath: testCachePath });

      expect(fs.existsSync(testCachePath)).toBe(true);
      service.clearCache();
      expect(fs.existsSync(testCachePath)).toBe(false);
    });
  });

  describe('Fallback Handling (CLI Failure / Timeout)', () => {
    it('should fallback to expired cache if CLI execution fails', () => {
      const cachedModels: DiscoveredModel[] = [{ id: 'fallback-cache', name: 'Fallback Cache Model' }];
      const cacheData: ModelCacheData = {
        timestamp: Date.now() - (DEFAULT_CACHE_TTL_MS + 50000), // expired
        models: cachedModels,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(cacheData, null, 2));

      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          throw new Error('Command failed: agy models timed out');
        },
      });

      const models = service.getModels();
      expect(models).toEqual(cachedModels);
    });

    it('should fallback to DEFAULT_BUILTIN_MODELS if CLI fails and no cache exists', () => {
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          throw new Error('agy: command not found');
        },
      });

      const models = service.getModels();
      expect(models).toEqual(DEFAULT_BUILTIN_MODELS);
      expect(models.length).toBeGreaterThanOrEqual(10);
    });

    it('should fallback to DEFAULT_BUILTIN_MODELS if CLI returns unparseable content and no cache exists', () => {
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => 'fatal error: failed to connect to daemon',
      });

      const models = service.getModels();
      expect(models).toEqual(DEFAULT_BUILTIN_MODELS);
    });
  });

  describe('Forced Refresh & refresh() Method', () => {
    it('should bypass valid cache when forceRefresh: true is passed', () => {
      let execCount = 0;
      const initialCached: DiscoveredModel[] = [{ id: 'initial-cached', name: 'Initial Model' }];
      const cacheData: ModelCacheData = {
        timestamp: Date.now(), // fresh
        models: initialCached,
      };
      fs.writeFileSync(testCachePath, JSON.stringify(cacheData, null, 2));

      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models = service.getModels({ forceRefresh: true });
      expect(execCount).toBe(1);
      expect(models).toHaveLength(14);
      expect(models[0].id).toBe('gemini-3.7-flash-high');
    });

    it('should refresh models via refresh() method', () => {
      let execCount = 0;
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommand: () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models = service.refresh();
      expect(execCount).toBe(1);
      expect(models).toHaveLength(14);
    });
  });

  describe('Async Discovery & Refresh', () => {
    it('should support getModelsAsync() with caching and fallback', async () => {
      let execCount = 0;
      const service = new ModelCatalogService({
        cachePath: testCachePath,
        execCommandAsync: async () => {
          execCount++;
          return MOCK_CLI_OUTPUT;
        },
      });

      const models1 = await service.getModelsAsync();
      expect(models1).toHaveLength(14);
      expect(execCount).toBe(1);

      // Second async call hits cache
      const models2 = await service.getModelsAsync();
      expect(models2).toEqual(models1);
      expect(execCount).toBe(1);

      // Forced async refresh
      const models3 = await service.refreshAsync();
      expect(models3).toHaveLength(14);
      expect(execCount).toBe(2);
    });
  });
});
