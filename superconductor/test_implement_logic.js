const fs = require('fs');
const path = require('path');

// This test simulates the logic within the implement.toml prompt
function testImplementLogic(providedName, tracks, userInput) {
    console.log(`Running test: providedName='${providedName}', userInput='${userInput}'`);
    
    // 1. Check for User Input
    let selectedTrack = null;
    if (providedName) {
        // 4.1. Match provided name
        selectedTrack = tracks.find(t => t.description.toLowerCase() === providedName.toLowerCase());
        if (selectedTrack) {
            console.log(`Matched provided track: ${selectedTrack.description}`);
            return { action: 'IMPLEMENT', track: selectedTrack };
        }
        console.log('No match for provided name, falling back to interactive.');
    }

    // 4.2. Interactive Selection (Simulated)
    const availableTracks = tracks.filter(t => t.status === ' ' || t.status === '~');
    
    // Simulate ask_user response
    if (userInput === 'Other') {
        console.log('User chose "Other" (New Track).');
        return { action: 'NEW_TRACK', description: 'New track description from placeholder' };
    } else {
        const choice = availableTracks.find(t => t.description === userInput);
        if (choice) {
            console.log(`User selected track: ${choice.description}`);
            return { action: 'IMPLEMENT', track: choice };
        }
    }

    return { action: 'NONE' };
}

const mockTracks = [
    { status: ' ', description: 'Feature A', link: './tracks/feat_a/' },
    { status: '~', description: 'Bug B', link: './tracks/bug_b/' },
    { status: 'x', description: 'Chore C', link: './tracks/chore_c/' }
];

// Test cases
try {
    console.log('--- Test 1: Match existing track by argument ---');
    const res1 = testImplementLogic('Feature A', mockTracks);
    if (res1.action !== 'IMPLEMENT' || res1.track.description !== 'Feature A') throw new Error('Test 1 failed');

    console.log('\n--- Test 2: Fallback to interactive, select existing ---');
    const res2 = testImplementLogic(null, mockTracks, 'Bug B');
    if (res2.action !== 'IMPLEMENT' || res2.track.description !== 'Bug B') throw new Error('Test 2 failed');

    console.log('\n--- Test 3: Fallback to interactive, select "Other" ---');
    const res3 = testImplementLogic(null, mockTracks, 'Other');
    if (res3.action !== 'NEW_TRACK') throw new Error('Test 3 failed');

    console.log('\nAll implementation logic tests PASSED');
} catch (err) {
    console.error('Test FAILED:', err.message);
    process.exit(1);
}
