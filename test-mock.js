const util = require('node:util');
const child_process = require('node:child_process');

child_process.execFile = (file, args, options, callback) => {
  if (typeof args === 'function') {
    callback = args;
  } else if (typeof options === 'function') {
    callback = options;
  }
  callback(null, 'stdout-test', 'stderr-test');
};

const execFileAsync = util.promisify(child_process.execFile);
execFileAsync('test').then(console.log).catch(console.error);
