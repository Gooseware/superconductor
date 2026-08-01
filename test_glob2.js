const path = require('path');
console.log("abs:", path.matchesGlob('/home/gooseware/repos/gemini/extensions/superconductor/packages/engine/src/index.ts', 'packages/*/src/**'));
console.log("abs without root:", path.matchesGlob(path.normalize('/home/gooseware/repos/...').replace(/^\//, ''), 'packages/*/src/**'));
