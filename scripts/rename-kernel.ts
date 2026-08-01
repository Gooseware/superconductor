import * as fs from 'fs';
import * as path from 'path';

const workspaceRoot = path.resolve(__dirname, '..');

function renameDir(src: string, dest: string) {
  if (fs.existsSync(src)) {
    console.log(`Renaming ${src} to ${dest}...`);
    fs.renameSync(src, dest);
  } else {
    console.log(`Source directory ${src} does not exist, skipping rename.`);
  }
}

function updateFile(filePath: string, updater: (content: string) => string) {
  if (fs.existsSync(filePath)) {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const newContent = updater(originalContent);
    if (originalContent !== newContent) {
      console.log(`Updating ${filePath}...`);
      fs.writeFileSync(filePath, newContent, 'utf8');
    }
  } else {
    console.log(`File ${filePath} does not exist, skipping.`);
  }
}

function walkAndReplace(dirPath: string, replacements: {from: RegExp|string, to: string}[]) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === '.vite') continue;
    
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkAndReplace(fullPath, replacements);
    } else {
      updateFile(fullPath, content => {
        let newContent = content;
        for (const {from, to} of replacements) {
          newContent = newContent.replaceAll(from, to);
        }
        return newContent;
      });
    }
  }
}

function main() {
  const oldKernelDir = path.join(workspaceRoot, 'packages', 'design-os-kernel');
  const newKernelDir = path.join(workspaceRoot, 'packages', 'superconductor-kernel');
  
  renameDir(oldKernelDir, newKernelDir);

  const packageJsonPath = path.join(newKernelDir, 'package.json');
  updateFile(packageJsonPath, content => {
    try {
      const pkg = JSON.parse(content);
      let changed = false;
      if (pkg.name !== '@superconductor/kernel') {
        pkg.name = '@superconductor/kernel';
        changed = true;
      }
      if (pkg.version !== '2.0.0') {
        pkg.version = '2.0.0';
        changed = true;
      }
      return changed ? JSON.stringify(pkg, null, 2) + '\n' : content;
    } catch (e) {
      console.error(`Error parsing ${packageJsonPath}`);
      return content;
    }
  });

  const replacements = [
    { from: '@design-os/mcp-server', to: '@superconductor/kernel' },
    { from: 'design-os-kernel', to: 'superconductor-kernel' }
  ];

  // Update all tracked files, this ensures no grep matches are left
  walkAndReplace(workspaceRoot, replacements);
}

main();
