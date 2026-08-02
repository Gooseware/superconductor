import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const REPO_ROOT = path.resolve(__dirname, '..');
const OLD_KERNEL_DIR = path.join(REPO_ROOT, 'packages', 'superconductor-kernel');
const NEW_KERNEL_DIR = path.join(REPO_ROOT, 'packages', 'superconductor-kernel');

// 1. Rename directory
if (fs.existsSync(OLD_KERNEL_DIR)) {
  fs.renameSync(OLD_KERNEL_DIR, NEW_KERNEL_DIR);
  console.log(`Renamed ${OLD_KERNEL_DIR} to ${NEW_KERNEL_DIR}`);
} else if (fs.existsSync(NEW_KERNEL_DIR)) {
  console.log(`${NEW_KERNEL_DIR} already exists, skipping rename.`);
} else {
  console.log(`Neither ${OLD_KERNEL_DIR} nor ${NEW_KERNEL_DIR} exists!`);
}

// 2. Update package.json
const pkgJsonPath = path.join(NEW_KERNEL_DIR, 'package.json');
if (fs.existsSync(pkgJsonPath)) {
  const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  let modified = false;
  if (pkgData.name !== '@superconductor/kernel') {
    pkgData.name = '@superconductor/kernel';
    modified = true;
  }
  if (pkgData.version !== '2.0.0') {
    pkgData.version = '2.0.0';
    modified = true;
  }
  if (modified) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf8');
    console.log(`Updated package.json name to @superconductor/kernel and version to 2.0.0`);
  } else {
    console.log(`package.json already up to date.`);
  }
}

// 3. String replacements
const filesToUpdate = [
  path.join(REPO_ROOT, 'mcp_config.json'),
  path.join(REPO_ROOT, 'GEMINI.md'),
];

// Add skill files if they exist
const homeDir = process.env.HOME || require('os').homedir();
const skillsDir = path.join(homeDir, '.gemini/config/plugins/superconductor-kernel');
if (fs.existsSync(skillsDir)) {
  // Use a simple recursive function instead of glob if glob isn't installed
  const findMdFiles = (dir: string): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        results = results.concat(findMdFiles(file));
      } else if (file.endsWith('.md')) {
        results.push(file);
      }
    });
    return results;
  };
  filesToUpdate.push(...findMdFiles(skillsDir));
}

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const newContent = content
      .replace(/@design-os\/mcp-server/g, '@superconductor/kernel')
      .replace(/superconductor-kernel/g, 'superconductor-kernel');
    if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated strings in ${file}`);
    } else {
      console.log(`No string replacements needed in ${file}`);
    }
  } else {
    console.log(`File not found: ${file}`);
  }
}

console.log('Codemod complete.');
