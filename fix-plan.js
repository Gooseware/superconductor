const fs = require('fs');
const content = fs.readFileSync('superconductor/tracks/orchestrator_self_healing_20260726/plan.md', 'utf8');

// Replace everything that matches `[AGENT:superconductor-processor]` followed by multiple hashes
const fixed = content.replace(/\[AGENT:superconductor-processor\] (1d209b3 )+/g, '[AGENT:superconductor-processor] 1d209b3');
fs.writeFileSync('superconductor/tracks/orchestrator_self_healing_20260726/plan.md', fixed);
