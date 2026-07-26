const fs = require('fs');
const implPath = 'packages/engine/src/concurrency/daemon-heartbeat.ts';
let impl = fs.readFileSync(implPath, 'utf8');
impl = impl.replace(
    /if \(this\.retryCount > max\) return;/,
    "if (this.retryCount > max) { console.log('aborting', this.retryCount, max); return; }"
);
impl = impl.replace(
    /let attemptSuccess = false;/,
    "console.log('reading, retryCount before read:', this.retryCount);\n            let attemptSuccess = false;"
);
fs.writeFileSync(implPath, impl);
