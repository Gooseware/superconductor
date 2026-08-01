const path = require('path');
console.log("1:", path.matchesGlob('../packages/engine/src/index.ts', 'packages/*/src/**'));
console.log("2:", path.matchesGlob('packages/engine/src/index.ts', 'packages/*/src/**'));
