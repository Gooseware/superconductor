import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ResearchExecutor } from './research-executor.js';
import { IResearchProvider, IResearchQuery, IResearchBrief } from './types.js';
import { WorkUnit, WorkUnitState } from '@superconductor/core/src/track/work-unit.js';
import { ResearchBudgetExceededError } from './errors/research-budget-exceeded-error.js';
import { ResearchProviderUnavailableError } from './errors/research-provider-unavailable-error.js';
import { SemanticCache } from '@superconductor/core/src/cache/semantic-cache.js';

vi.mock('@superconductor/core/src/cache/semantic-cache.js', () => {
    return {
        SemanticCache: vi.fn().mockImplementation(() => ({
            get: vi.fn(),
            set: vi.fn()
        }))
    };
});

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn()
    };
});

describe('ResearchExecutor', () => {
    let mockProvider: IResearchProvider;
    let mockExecuteTool: any;
    const workspaceDir = '/test/workspace';

    beforeEach(() => {
        vi.clearAllMocks();
        mockProvider = {
            search: vi.fn().mockResolvedValue([{ url: 'test.com', title: 'Test' }])
        };
        mockExecuteTool = vi.fn().mockResolvedValue([{ url: 'https://stackoverflow.com/q/123', title: 'Fallback' }]);
    });

    it('should throw ResearchBudgetExceededError if >3 queries', async () => {
        const executor = new ResearchExecutor(workspaceDir);
        const queries = [{ term: '1' }, { term: '2' }, { term: '3' }, { term: '4' }];
        await expect(executor.execute('t1', queries, mockProvider)).rejects.toThrow(ResearchBudgetExceededError);
    });

    it('should skip provider if cache hit', async () => {
        const mockBrief = { trackId: 't1', executiveSummary: 'cached' };
        
        vi.mocked(SemanticCache).mockImplementationOnce(() => ({
            get: vi.fn().mockResolvedValue(mockBrief),
            set: vi.fn(),
            namespace: '',
            similarityThreshold: 0,
            basePath: '',
            getHash: vi.fn(),
            getFilePath: vi.fn(),
            ensureDir: vi.fn(),
            invalidate: vi.fn()
        }) as any);

        const executor = new ResearchExecutor(workspaceDir);
        // have to force override since it's instantiated in constructor
        const mockCacheGet = vi.fn().mockResolvedValue(mockBrief);
        (executor as any).cache = { get: mockCacheGet };

        const queries = [{ term: 'q1' }];
        const res = await executor.execute('t1', queries, mockProvider);
        expect(res).toEqual(mockBrief);
        expect(mockProvider.search).not.toHaveBeenCalled();
    });

    it('should transition work unit state to RESEARCHING', async () => {
        const executor = new ResearchExecutor(workspaceDir);
        const mockCacheGet = vi.fn().mockResolvedValue(null);
        const mockCacheSet = vi.fn();
        (executor as any).cache = { get: mockCacheGet, set: mockCacheSet };
        
        const wu: WorkUnit = {
            unitId: 'u1',
            domainScope: [],
            spec: '',
            state: WorkUnitState.PENDING,
            implementorId: 'i1'
        };

        const queries = [{ term: 'q1' }];
        await executor.execute('t1', queries, mockProvider, wu);
        expect(wu.state).toBe(WorkUnitState.RESEARCHING);
    });

    it('should fall back to search_web if provider unavailable', async () => {
        mockProvider.search = vi.fn().mockRejectedValue(new ResearchProviderUnavailableError('unavailable'));
        const executor = new ResearchExecutor(workspaceDir, mockExecuteTool);
        
        const mockCacheGet = vi.fn().mockResolvedValue(null);
        const mockCacheSet = vi.fn();
        (executor as any).cache = { get: mockCacheGet, set: mockCacheSet };

        const queries = [{ term: 'fallback-test' }];
        const brief = await executor.execute('t1', queries, mockProvider);

        expect(mockExecuteTool).toHaveBeenCalledWith('search_web', { query: 'fallback-test' });
        expect(mockProvider.search).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalled();
        
        // Assert it hit the synthesizer and returned a brief
        expect(brief.queriesExecuted).toContain('fallback-test');
    });

    it('should save brief.json and call cache set', async () => {
        const executor = new ResearchExecutor(workspaceDir);
        const mockCacheGet = vi.fn().mockResolvedValue(null);
        const mockCacheSet = vi.fn();
        (executor as any).cache = { get: mockCacheGet, set: mockCacheSet };
        
        const queries = [{ term: 'q1' }];
        await executor.execute('t1', queries, mockProvider);
        
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('brief.json'),
            expect.any(String),
            'utf8'
        );
        expect(mockCacheSet).toHaveBeenCalled();
    });
});
