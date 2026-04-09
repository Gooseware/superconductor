const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testTracks = `# Project Tracks

This file tracks all major tracks for the project. Each track has its own detailed plan in its respective folder.

---

- [ ] **Track: Test Track 1**
*Link: [./tracks/test_1/](./tracks/test_1/)*

---

- [~] **Track: Test Track 2**
*Link: [./tracks/test_2/](./tracks/test_2/)*

---

- [x] **Track: Completed Track**
*Link: [./tracks/completed/](./tracks/completed/)*
`;

const tracksPath = path.join(__dirname, 'tracks.md');
const backupPath = path.join(__dirname, 'tracks.md.bak');

// Backup
if (fs.existsSync(tracksPath)) {
    fs.copyFileSync(tracksPath, backupPath);
}

try {
    // Write test data
    fs.writeFileSync(tracksPath, testTracks);

    // Test get_planned_tracks.js
    console.log('Testing get_planned_tracks.js...');
    const output = execSync('node get_planned_tracks.js').toString();
    const tracks = JSON.parse(output);
    
    if (tracks.length !== 3) throw new Error(`Expected 3 tracks, got ${tracks.length}`);
    if (tracks[0].description !== 'Test Track 1') throw new Error('First track description mismatch');
    if (tracks[2].status !== 'x') throw new Error('Third track status mismatch');
    console.log('get_planned_tracks.js PASSED');

    // Test present_track_selection.js
    console.log('Testing present_track_selection.js...');
    const optionsOutput = execSync(`node present_track_selection.js '${JSON.stringify(tracks)}'`).toString();
    const options = JSON.parse(optionsOutput);
    
    if (options.length !== 2) throw new Error(`Expected 2 available tracks, got ${options.length}`);
    if (options[0].label !== 'Test Track 1') throw new Error('First option label mismatch');
    console.log('present_track_selection.js PASSED');

} catch (err) {
    console.error('Test FAILED:', err.message);
    process.exit(1);
} finally {
    // Restore
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, tracksPath);
        fs.unlinkSync(backupPath);
    }
}
