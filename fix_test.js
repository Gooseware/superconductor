const crypto = require('crypto');
const record1 = { id: 1 };
const record2 = { id: 1, metadata: null };
console.log(crypto.createHash('sha256').update(JSON.stringify(record1)).digest('hex'));
console.log(crypto.createHash('sha256').update(JSON.stringify(record2)).digest('hex'));
