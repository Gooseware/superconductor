import { ParallelDispatcher } from './packages/engine/src/dispatcher/parallel-dispatcher.ts';

function testBoundary() {
    const disp0 = new ParallelDispatcher(0);
    console.log("N=0", disp0['maxConcurrent']);
    const disp1 = new ParallelDispatcher(1);
    console.log("N=1", disp1['maxConcurrent']);
}
testBoundary();
