import { SemanticCache } from './packages/superconductor-core/src/cache/semantic-cache.js';
import * as fs from 'fs/promises';

async function test() {
    // Test Silent Degradation
    const cache = new SemanticCache('test-adv', 0.85, '/sys/class/power_supply/BAT0'); // a read-only or invalid dir
    try {
        await cache.set('hello', 'world');
        console.log("FAIL: Did not throw, silent failure");
    } catch (e) {
        console.log("PASS: Threw", e.message);
    }
}
test();
