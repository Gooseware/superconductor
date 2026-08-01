const util = require('node:util');
const child_process = require('node:child_process');

console.log(util.promisify(child_process.execFile) === child_process.execFile[util.promisify.custom]);

child_process.execFile[util.promisify.custom] = async () => {
    return { stdout: 'custom stdout', stderr: 'custom stderr' };
};

const execFileAsync = util.promisify(child_process.execFile);
execFileAsync('test').then(console.log).catch(console.error);
