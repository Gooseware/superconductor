const util = require('node:util');
const mockExecFile = () => {};
mockExecFile[util.promisify.custom] = () => Promise.resolve({ stdout: 'custom stdout', stderr: 'custom stderr' });

const promisified = util.promisify(mockExecFile);
promisified('test').then(console.log).catch(console.error);
