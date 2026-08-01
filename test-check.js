const fs = require('fs');
const path = require('path');
const f = fs.readFileSync('packages/superconductor-core/tests/swarm/quorum-fsm.test.ts', 'utf8');
const f2 = f.replace("const res = await fsm.run();", "const res = await fsm.run(); console.log('res is:', res);");
fs.writeFileSync('packages/superconductor-core/tests/swarm/quorum-fsm.test.ts', f2);
