const fs = require('fs');
const path = require('path');

const logFilePath = process.argv[2];

if (!logFilePath) {
    console.error('Usage: node optimize_tokens.js <path_to_session.json>');
    process.exit(1);
}

if (!fs.existsSync(logFilePath)) {
    console.error(`Error: Log file not found at ${logFilePath}`);
    process.exit(1);
}

function analyzeTokens() {
    const session = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
    const tokenThreshold = 5000;
    const callHistory = new Map();

    console.log(`Analyzing token usage from session: ${logFilePath}`);

    if (!session.messages) {
        console.log('No messages found in session file.');
        return;
    }

    session.messages.forEach(msg => {
        if (msg.type === 'gemini' && msg.toolCalls) {
            msg.toolCalls.forEach(call => {
                const tool = call.name;
                const args = call.args || {};
                const tokens = (msg.tokens && msg.tokens.total) || 0;

                // 1. Detect high-token messages containing this call
                if (tokens > tokenThreshold) {
                    console.log(`High token message: ${tool} (Total Message Tokens: ${tokens})`);
                }

                // 2. Detect redundant calls contributing to token waste
                const key = `${tool}|||${JSON.stringify(args)}`;
                if (callHistory.has(key)) {
                    console.log(`Redundant tool call detected: ${tool}`);
                    console.log(`  Args: ${JSON.stringify(args)}`);
                }
                callHistory.set(key, (callHistory.get(key) || 0) + 1);
            });
        }
    });
}

analyzeTokens();
