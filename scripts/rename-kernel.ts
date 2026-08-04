import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..');
const OLD_KERNEL_DIR = path.join(REPO_ROOT, 'packages', 'design-os-kernel');
const NEW_KERNEL_DIR = path.join(REPO_ROOT, 'packages', 'superconductor-kernel');

const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('Running in DRY-RUN mode. No changes will be made to the filesystem.');
}

// 1. Rename packages directory
if (fs.existsSync(OLD_KERNEL_DIR)) {
  if (!isDryRun) {
    fs.renameSync(OLD_KERNEL_DIR, NEW_KERNEL_DIR);
  }
  console.log(`Renamed ${OLD_KERNEL_DIR} to ${NEW_KERNEL_DIR}${isDryRun ? ' (dry-run)' : ''}`);
} else if (fs.existsSync(NEW_KERNEL_DIR)) {
  console.log(`${NEW_KERNEL_DIR} already exists, skipping rename.`);
} else {
  console.log(`Neither ${OLD_KERNEL_DIR} nor ${NEW_KERNEL_DIR} exists!`);
}

// 2. Rename skill directories
const skillDirRenames = [
  {
    oldDir: path.join(REPO_ROOT, 'skills', 'design-os-kernel-setup'),
    newDir: path.join(REPO_ROOT, 'skills', 'superconductor-kernel-setup'),
  },
  {
    oldDir: path.join(REPO_ROOT, 'skills', 'design-os-kernel-dogma'),
    newDir: path.join(REPO_ROOT, 'skills', 'superconductor-kernel-dogma'),
  },
  {
    oldDir: path.join(REPO_ROOT, 'skills', 'design-os-kernel-dogma.skill'),
    newDir: path.join(REPO_ROOT, 'skills', 'superconductor-kernel-dogma.skill'),
  },
];

for (const { oldDir, newDir } of skillDirRenames) {
  if (fs.existsSync(oldDir)) {
    if (!isDryRun) {
      fs.renameSync(oldDir, newDir);
    }
    console.log(`Renamed ${oldDir} to ${newDir}${isDryRun ? ' (dry-run)' : ''}`);
  } else if (fs.existsSync(newDir)) {
    console.log(`${newDir} already exists, skipping rename.`);
  } else {
    console.log(`Neither ${oldDir} nor ${newDir} exists!`);
  }
}

// 3. Update package.json
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
    if (!isDryRun) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf8');
    }
    console.log(`Updated package.json name to @superconductor/kernel and version to 2.0.0${isDryRun ? ' (dry-run)' : ''}`);
  } else {
    console.log(`package.json already up to date.`);
  }
}

// 4. String replacements in target files
const filesToUpdateSet = new Set<string>([
  path.join(REPO_ROOT, 'mcp_config.json'),
  path.join(REPO_ROOT, 'GEMINI.md'),
]);

const findMdFiles = (dir: string): string[] => {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      const fullPath = path.join(dir, file);
      try {
        if (!fs.existsSync(fullPath)) return;
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(findMdFiles(fullPath));
        } else if (file.endsWith('.md')) {
          results.push(fullPath);
        }
      } catch (err) {
        // Skip inaccessible paths
      }
    });
  } catch (err) {
    // Skip inaccessible directories
  }
  return results;
};

const homeDir = process.env.HOME || require('os').homedir();
const pluginsDir = path.join(homeDir, '.gemini', 'config', 'plugins');
if (fs.existsSync(pluginsDir)) {
  findMdFiles(pluginsDir).forEach((f) => filesToUpdateSet.add(f));
}

const repoSkillsDir = path.join(REPO_ROOT, 'skills');
if (fs.existsSync(repoSkillsDir)) {
  findMdFiles(repoSkillsDir).forEach((f) => filesToUpdateSet.add(f));
}

const filesToUpdate = Array.from(filesToUpdateSet);

for (const file of filesToUpdate) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const newContent = content
      .replace(/@superconductor\/design-os-kernel/g, '@superconductor/kernel')
      .replace(/@design-os\/mcp-server/g, '@superconductor/kernel')
      .replace(/@design-os\/kernel/g, '@superconductor/kernel')
      .replace(/design-os-kernel/g, 'superconductor-kernel');
    if (content !== newContent) {
      if (!isDryRun) {
        fs.writeFileSync(file, newContent, 'utf8');
      }
      console.log(`Updated strings in ${file}${isDryRun ? ' (dry-run)' : ''}`);
    } else {
      console.log(`No string replacements needed in ${file}`);
    }
  } else {
    console.log(`File not found: ${file}`);
  }
}

console.log('Codemod complete.');
