const fs = require('fs');
const file = 'packages/superconductor-core/tests/swarm/quorum-fsm.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(`// @ts-ignore
        let loops = 0;
        // @ts-ignore
        child_process.execFile[util.promisify.custom].mockImplementation(async () => {
            loops++;
            return { stdout: \`{"findings":["new error \${loops}"]}\`, stderr: '' };
        });

        const fsm = new QuorumFSM('test.ts');
        
        const res = await fsm.run();`, `// @ts-ignore
        let loopCount = 0;
        child_process.execFile[Symbol.for('nodejs.util.promisify.custom')].mockImplementation(async () => {
            loopCount++;
            return { stdout: \`{"findings":["new error \${loopCount}"]}\`, stderr: '' };
        });

        const fsm = new QuorumFSM('test.ts');
        
        const res1 = await fsm.run();
        expect(res1.status).toBe('REMEDIATION_REQUIRED');

        const res2 = await fsm.run();
        expect(res2.status).toBe('REMEDIATION_REQUIRED');

        const res3 = await fsm.run();`);

// Also fix the previous replace logic where util wasn't available
code = code.replace(/child_process\.execFile\[util\.promisify\.custom\]/g, "child_process.execFile[Symbol.for('nodejs.util.promisify.custom')]");

fs.writeFileSync(file, code);
