const fs = require('fs');

let content = fs.readFileSync('packages/engine/src/research/research-executor.ts', 'utf8');

// Add ensureDirectory method
content = content.replace(
    /public async execute/,
    `private ensureDirectory(outDir: string) {
        if (fs.existsSync(outDir)) {
            if (!fs.statSync(outDir).isDirectory()) {
                throw new Error(\`ENOTDIR: not a directory, open '\${outDir}'\`);
            }
        } else {
            fs.mkdirSync(outDir, { recursive: true });
        }
    }

    public async execute`
);

// Replace duplicated blocks
const block1 = `if (fs.existsSync(outDir)) {
                if (!fs.statSync(outDir).isDirectory()) {
                    throw new Error(\`ENOTDIR: not a directory, open '\${outDir}'\`);
                }
            } else {
                fs.mkdirSync(outDir, { recursive: true });
            }`;

const block2 = `if (fs.existsSync(outDir)) {
                if (!fs.statSync(outDir).isDirectory()) {
                    throw new Error(\`ENOTDIR: not a directory, open '\${outDir}'\`);
                }
            } else {
                fs.mkdirSync(outDir, { recursive: true });
            }`;

content = content.replace(block1, 'this.ensureDirectory(outDir);');
content = content.replace(block2, 'this.ensureDirectory(outDir);');

fs.writeFileSync('packages/engine/src/research/research-executor.ts', content);
