const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const initiatorPath = path.join('superconductor', 'initiate_track.js');

function runTest() {
    console.log('Running self-initiation tests...');

    if (!fs.existsSync(initiatorPath)) {
        console.error(`Error: ${initiatorPath} does not exist.`);
        process.exit(1);
    }

    try {
        // Test 1: Generate the correct command string
        // We'll mock the internal logic or check the return value
        const trackDesc = 'Fix tool hallucinations';
        const output = execSync(`node ${initiatorPath} "${trackDesc}" --dry-run`).toString();

        if (!output.includes(`/superconductor:newTrack ${trackDesc}`)) {
            throw new Error('Test 1 failed: Incorrect command generated');
        }

        console.log('All initiation tests passed.');
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}

runTest();
