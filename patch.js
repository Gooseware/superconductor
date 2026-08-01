const fs = require('fs');
const file = 'packages/superconductor-core/tests/swarm/quorum-fsm.test.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(`vi.mock('node:child_process', () => ({
    execFile: vi.fn()
}));

vi.mock('node:util', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        promisify: (fn: any) => fn
    };
});`, `vi.mock('node:child_process', () => {
    const execFile = vi.fn();
    (execFile as any)[Symbol.for('nodejs.util.promisify.custom')] = vi.fn();
    return { execFile };
});`);

code = code.replace(`// @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: 'No errors' });`, `// @ts-ignore
        child_process.execFile[util.promisify.custom].mockResolvedValue({ stdout: 'No errors', stderr: '' });`);

code = code.replace(`// @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: '{"findings":["some error"]}' });`, `// @ts-ignore
        child_process.execFile[util.promisify.custom].mockResolvedValue({ stdout: '{"findings":["some error"]}', stderr: '' });`);

code = code.replace(`// @ts-ignore
        child_process.execFile.mockResolvedValue({ stdout: '{"findings":["new error"]}' });

        const fsm = new QuorumFSM('test.ts');
        fsm.stateData.loops = 2; // Next one will be 3
        
        const res = await fsm.run();`, `// @ts-ignore
        let loops = 0;
        // @ts-ignore
        child_process.execFile[util.promisify.custom].mockImplementation(async () => {
            loops++;
            return { stdout: \`{"findings":["new error \${loops}"]}\`, stderr: '' };
        });

        const fsm = new QuorumFSM('test.ts');
        
        const res = await fsm.run();`);

fs.writeFileSync(file, code);
