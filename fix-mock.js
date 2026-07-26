const fs = require('fs');
const testPath = 'packages/engine/tests/daemon-heartbeat.test.ts';
let code = fs.readFileSync(testPath, 'utf8');
code = code.replace(
    /beforeEach\(\(\) => \{/,
    "beforeEach(() => {\n        vi.clearAllMocks();"
);
fs.writeFileSync(testPath, code);

const implPath = 'packages/engine/src/concurrency/daemon-heartbeat.ts';
let impl = fs.readFileSync(implPath, 'utf8');
impl = impl.replace(
    /console\.log\('aborting', this\.retryCount, max\); /,
    ""
);
impl = impl.replace(
    /console\.log\('reading, retryCount before read:', this\.retryCount\);\n            /,
    ""
);
fs.writeFileSync(implPath, impl);
