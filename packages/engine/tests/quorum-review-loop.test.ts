import { describe, it, expect, vi } from 'vitest';
import { 
    QuorumReviewLoop, 
    validateReviewerPayload
} from '../src/verification/quorum-review-loop';

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
            
        let counter = 0;
        const mockRemediate = vi.fn().mockImplementation((code, findings) => Promise.resolve(code + ' remediated' + (++counter)));
            
        const loop = new QuorumReviewLoop({ maxIterations: 5, reviewerFn: mockReviewer, remediateFn: mockRemediate });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(3);
        expect(mockRemediate).toHaveBeenCalledTimes(2);
        expect(result.status).toBe('RESOLVED');
    });

    it('should break out of the loop immediately when a RESOLVED status is received', async () => {
        const mockReviewer = vi.fn().mockResolvedValue({ status: 'RESOLVED', findings: [] });
        const mockRemediate = vi.fn();
            
        const loop = new QuorumReviewLoop({ maxIterations: 5, reviewerFn: mockReviewer, remediateFn: mockRemediate });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(1);
        expect(mockRemediate).toHaveBeenCalledTimes(0);
        expect(result.status).toBe('RESOLVED');
    });

    it('should stop after hitting maxIterations even if not resolved (e.g. assert loop halts after 3 remediation cycles)', async () => {
        const mockReviewer = vi.fn().mockResolvedValue({ status: 'REJECTED', findings: ['Always fails'] });
        let counter = 0;
        const mockRemediate = vi.fn().mockImplementation((code) => Promise.resolve(code + (++counter)));
            
        const loop = new QuorumReviewLoop({ maxIterations: 3, reviewerFn: mockReviewer, remediateFn: mockRemediate });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(3);
        expect(mockRemediate).toHaveBeenCalledTimes(3);
        expect(result.status).toBe('MAX_ITERATIONS_REACHED');
    });

    it('should halt with THRASH_DETECTED if state hash recurs', async () => {
        const mockReviewer = vi.fn().mockResolvedValue({ status: 'REJECTED', findings: ['Always fails'] });
        const mockRemediate = vi.fn().mockImplementation((payloads) => Promise.resolve("unchanged_code"));
            
        const loop = new QuorumReviewLoop({ maxIterations: 5, reviewerFn: mockReviewer, remediateFn: mockRemediate });
        const result = await loop.run('some-code');
        
        expect(mockReviewer).toHaveBeenCalledTimes(2);
        expect(mockRemediate).toHaveBeenCalledTimes(2);
        expect(result.status).toBe('THRASH_DETECTED');
    });
});
