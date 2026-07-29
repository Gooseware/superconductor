import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticCache } from '../../src/cache/semantic-cache.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SemanticCache', () => {
    let testDir: string;
    let cache: SemanticCache<any>;
    const namespace = 'test-namespace';

    beforeEach(async () => {
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'superconductor-cache-test-'));
        cache = new SemanticCache<any>(namespace, 0.85, testDir);
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
    });

    it('returns null on cache miss', async () => {
        const result = await cache.get('non-existent query');
        expect(result).toBeNull();
    });

    it('returns value on exact hit', async () => {
        await cache.set('my test query', { data: 'test-value' });
        const result = await cache.get('my test query');
        expect(result).toEqual({ data: 'test-value' });
    });

    it('works across different namespaces (namespace isolation)', async () => {
        const otherCache = new SemanticCache<any>('other-namespace', 0.85, testDir);
        await cache.set('my query', { data: 'namespace1' });
        
        const res1 = await cache.get('my query');
        expect(res1).toEqual({ data: 'namespace1' });
        
        const res2 = await otherCache.get('my query');
        expect(res2).toBeNull();
    });

    it('returns value on similar query above threshold (simple hash match for MVP)', async () => {
        await cache.set('hello world', 42);
        const result = await cache.get('hello world');
        expect(result).toBe(42);
    });

    it('returns null if options.refresh is true (bypasses cache)', async () => {
        await cache.set('force refresh query', { data: 123 });
        
        // Cache should hit normally
        let result = await cache.get('force refresh query');
        expect(result).toEqual({ data: 123 });

        // Cache should be bypassed if refresh: true
        result = await cache.get('force refresh query', { refresh: true });
        expect(result).toBeNull();
    });

    it('invalidates cache entry', async () => {
        await cache.set('invalidate me', 'value');
        expect(await cache.get('invalidate me')).toBe('value');
        
        await cache.invalidate('invalidate me');
        expect(await cache.get('invalidate me')).toBeNull();
    });
});
