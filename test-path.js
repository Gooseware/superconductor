const path = require('path');
const fs = require('fs');

function isRogueWrite(targetFile) {
  let resolvedPath = path.resolve(targetFile);
  try {
    resolvedPath = fs.realpathSync(resolvedPath);
  } catch (e) {
    // File might not exist yet, resolve based on directory
    const dir = path.dirname(resolvedPath);
    try {
      resolvedPath = path.join(fs.realpathSync(dir), path.basename(resolvedPath));
    } catch (e2) {}
  }

  const pathParts = resolvedPath.split(path.sep);
  const packagesIndex = pathParts.lastIndexOf('packages');
  if (packagesIndex !== -1 && pathParts.length > packagesIndex + 2 && pathParts[packagesIndex + 2] === 'src') {
      return true;
  }
  return false;
}

console.log(isRogueWrite('packages/superconductor-core/src/index.ts'));
console.log(isRogueWrite('/foo/bar/packages/my-lib/src/foo.ts'));
