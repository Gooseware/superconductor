const fs = require('fs');
const file = 'tests/swarm/quorum-fsm.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(`        expect(res3.status).toBe('APPROVED');`, `        expect(res.status).toBe('APPROVED');`);
code = code.replace(`        expect(res3.status).toBe('FAILED');`, `        expect(res.status).toBe('FAILED');`);

fs.writeFileSync(file, code);
