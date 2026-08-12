const crypto = require('crypto');
const signKey = crypto.createHash('sha256').update("test-session:test-track:1234567890").digest('hex');
console.log("Spoofed Key:", signKey);
