const util = require('node:util');

const mockExecFile = (file, args, options, cb) => {
    if (typeof options === 'function') cb = options;
    if (typeof args === 'function') cb = args;
    cb(null, 'mock stdout', 'mock stderr');
};

const promisified = util.promisify(mockExecFile);
promisified('test').then(console.log).catch(console.error);
