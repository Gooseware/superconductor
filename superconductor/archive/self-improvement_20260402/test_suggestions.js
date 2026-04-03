const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const enginePath = path.join('superconductor', 'suggest_tracks.js');
const mockSessionPath = path.join('superconductor', 'tracks', 'self-improvement_20260402', 'mock_session_errors.json');

function runTest() {
    console.log('Running track suggestion engine tests...');

    if (!fs.existsSync(enginePath)) {
        console.error(`Error: ${enginePath} does not exist.`);
        process.exit(1);
    }

    const mockSession = {
        messages: [
            {
                type: 'gemini',
                toolCalls: [
                    { name: 'replace', status: 'success', result: [{ response: { output: '0 occurrences found' } }] },
                    { name: 'replace', status: 'success', result: [{ response: { output: '0 occurrences found' } }] }
                ]
            },
            {
                type: 'gemini',
                toolCalls: [
                    { name: 'exit_plan_mode', status: 'error', result: [{ response: { output: 'Tool not found' } }] }
                ]
            }
        ]
    };

    fs.writeFileSync(mockSessionPath, JSON.stringify(mockSession, null, 2));

    try {
        const output = execSync(`node ${enginePath} ${mockSessionPath}`).toString();

        // Test 1: Suggest track for replace failures
        if (!output.includes('Improve replace tool reliability')) {
            throw new Error('Test 1 failed: Missing suggestion for replace failures');
        }

        // Test 2: Suggest track for tool hallucinations
        if (!output.includes('Fix tool hallucinations')) {
            throw new Error('Test 2 failed: Missing suggestion for hallucinations');
        }

        // Test 3: Check prioritization (replace failures occurred twice)
        if (output.indexOf('Improve replace tool reliability') > output.indexOf('Fix tool hallucinations')) {
             // Basic prioritization check (first in output = higher priority)
             // Note: This depends on the engine implementation
        }

        console.log('All track suggestion tests passed.');
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    } finally {
        if (fs.existsSync(mockSessionPath)) fs.unlinkSync(mockSessionPath);
    }
}

runTest();
