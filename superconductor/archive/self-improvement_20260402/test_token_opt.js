const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const optimizerPath = path.join('superconductor', 'optimize_tokens.js');
const mockLogsPath = path.join('superconductor', 'tracks', 'self-improvement_20260402', 'token_logs.json');

function runTest() {
    console.log('Running token optimization tests (Node.js)...');

    if (!fs.existsSync(optimizerPath)) {
        console.error(`Error: ${optimizerPath} does not exist.`);
        process.exit(1);
    }

    const mockLogs = [
        { "type": "tool_call", "tool": "read_file", "args": "large_file.md", "tokens": 5000 },
        { "type": "tool_call", "tool": "read_file", "args": "large_file.md", "tokens": 5000 },
        { "type": "tool_call", "tool": "grep_search", "args": "pattern", "tokens": 200 }
    ];

    fs.writeFileSync(mockLogsPath, JSON.stringify(mockLogs, null, 2));

    try {
        const output = execSync(`node ${optimizerPath} ${mockLogsPath}`).toString();

        // Test 1: Detect high-token calls (>1000 tokens)
        if (!output.includes('High token call: read_file')) {
            throw new Error('Test 1 failed: Failed to detect high-token call');
        }

        // Test 2: Detect redundant reads contributing to token waste
        if (!output.includes('Redundant token waste: read_file')) {
            throw new Error('Test 2 failed: Failed to detect redundant token waste');
        }

        console.log('All token optimization tests passed.');
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    } finally {
        if (fs.existsSync(mockLogsPath)) fs.unlinkSync(mockLogsPath);
    }
}

runTest();
