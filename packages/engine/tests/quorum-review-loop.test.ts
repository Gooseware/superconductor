import { describe, it, expect, vi } from 'vitest';
import { 
    QuorumReviewLoop, 
    validateReviewerPayload, 
    CodebaseChunker 
} from '../src/verification/quorum-review-loop';

describe('CodebaseChunker', () => {
    it('should chunk large codebases into parts strictly below the 100k token limit', () => {
        const largeText = 'token '.repeat(110000);
        const chunker = new CodebaseChunker({ tokenLimit: 100000 });
        const chunks = chunker.chunk(largeText);
        
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(100000 * 6);
        }
    });
});

describe('validateReviewerPayload', () => {
    it('should throw an error if both RESOLVED status and findings are provided', () => {
        const payload = {
            status: 'RESOLVED',
            findings: ['Bug on line 42']
        };
        
        expect(() => validateReviewerPayload(payload)).toThrowError(/Mutual exclusivity violated/);
    });

    it('should pass if RESOLVED status has no findings', () => {
        const payload = {
            status: 'RESOLVED',
            findings: []
        };
        
        expect(() => validateReviewerPayload(payload)).not.toThrow();
    });

    it('should pass if findings are present and status is not RESOLVED', () => {
        const payload = {
            status: 'REJECTED',
            findings: ['Bug on line 42']
        };
        
        expect(() => validateReviewerPayload(payload)).not.toThrow();
    });
});

describe('QuorumReviewLoop', () => {
    it('should allow multiple review iterations up to maxIterations', async () => {
        const mockReviewer = vi.fn()
            .mockResolvedValueOnce({ status: 'REJECTED', findings: ['Error 1'] })
            .mockResolvedValueOnce({ status: 'REJECTED', findings: ['Error 2'] })
            .mockResolvedValueOnce({ status: 'RESOLVED', findings: [] });
            
        const loop = new QuorumReviewLoop({ maxIterations: 5, reviewerFn: mockReviewer });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(3);
        expect(result.status).toBe('RESOLVED');
    });

    it('should break out of the loop immediately when a RESOLVED status is received', async () => {
        const mockReviewer = vi.fn().mockResolvedValue({ status: 'RESOLVED', findings: [] });
            
        const loop = new QuorumReviewLoop({ maxIterations: 5, reviewerFn: mockReviewer });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('RESOLVED');
    });

    it('should stop after hitting maxIterations even if not resolved', async () => {
        const mockReviewer = vi.fn().mockResolvedValue({ status: 'REJECTED', findings: ['Always fails'] });
            
        const loop = new QuorumReviewLoop({ maxIterations: 3, reviewerFn: mockReviewer });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(3);
        expect(result.status).toBe('MAX_ITERATIONS_REACHED');
    });
});
