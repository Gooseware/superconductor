const { IntelligenceSnapshotReader } = require('./packages/superconductor-core/dist/intelligence/snapshot-reader.js');
const { getSuperconductorHome } = require('./packages/superconductor-core/dist/intelligence/tool-registry.js');

try {
    const dir = getSuperconductorHome();
    const context = IntelligenceSnapshotReader.load(dir);
    if (context) {
        console.log(JSON.stringify({ 
            driftBanner: context.driftBanner || 'No drift banner',
            hasContext: true
        }));
    } else {
        console.log(JSON.stringify({ hasContext: false }));
    }
} catch (e) {
    console.error(e);
}
