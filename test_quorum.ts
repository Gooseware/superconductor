import { QuorumReviewLoop } from './packages/engine/src/verification/quorum-review-loop.ts';

async function testBoundary() {
    const loop0 = new QuorumReviewLoop({
        maxIterations: 0,
        reviewerFn: async () => ({ status: 'PENDING', findings: ['foo'] }),
        remediateFn: async () => 'code'
    });
    console.log("N=0", await loop0.run('code'));

    const loop1 = new QuorumReviewLoop({
        maxIterations: 1,
        reviewerFn: async () => ({ status: 'PENDING', findings: ['foo'] }),
        remediateFn: async () => 'code'
    });
    console.log("N=1", await loop1.run('code'));
}
testBoundary();
