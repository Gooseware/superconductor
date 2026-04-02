const fs = require('fs');
const path = require('path');

const logFilePath = process.argv[2];

if (!logFilePath) {
    console.error('Usage: node optimize_tokens.js <path_to_logs.json>');
    process.exit(1);
}

if (!fs.existsSync(logFilePath)) {
    console.error(`Error: Log file not found at ${logFilePath}`);
    process.exit(1);
}

function analyzeTokens() {
    const logs = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
    const tokenThreshold = 1000;
    const callHistory = new Map();

    console.log(`Analyzing token usage from: ${logFilePath}`);

    logs.forEach(log => {
        if (log.type === 'tool_call') {
            const tool = log.tool;
            const args = log.args || '';
            const tokens = log.tokens || 0;

            // 1. Detect high-token calls
            if (tokens > tokenThreshold) {
                console.log(`High token call: ${tool} (Tokens: ${tokens})`);
            }

            // 2. Detect redundant calls contributing to token waste
            const key = `${tool}|||${JSON.stringify(args)}`;
            if (callHistory.has(key)) {
                console.log(`Redundant token waste: ${tool}`);
            }
            callHistory.set(key, (callHistory.get(key) || 0) + tokens);
        }
    });
}

analyzeTokens();
