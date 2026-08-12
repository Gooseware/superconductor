const path = require('path');
const process = require('process');
function testBypass() {
    const projectRootOrDbPath = path.resolve(process.cwd() + '_evil.db');
    let targetPath;
    if (projectRootOrDbPath.endsWith('.db')) {
      targetPath = path.resolve(projectRootOrDbPath);
    } else {
      targetPath = path.resolve(projectRootOrDbPath, 'superconductor', 'notebook', 'notebook_fts.db');
    }

    const workspaceBoundary = path.resolve(process.cwd());
    if (!targetPath.startsWith(workspaceBoundary)) {
      throw new Error(`Database path escapes workspace boundary: ${targetPath}`);
    }
    return "BYPASS_SUCCESS: " + targetPath;
}
console.log(testBypass());
