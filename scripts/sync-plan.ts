import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTaskProvider } from '../packages/task-store/src/providers/task-provider-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const planPath = process.argv[2];
  if (!planPath) {
    console.error("Usage: npx tsx scripts/sync-plan.ts <path/to/plan.md>");
    process.exit(1);
  }

  const absPlanPath = path.resolve(planPath);
  if (!fs.existsSync(absPlanPath)) {
    console.error(`File not found: ${absPlanPath}`);
    process.exit(1);
  }

  const trackId = path.basename(path.dirname(absPlanPath));
  const workspacePath = path.resolve(__dirname, '..'); 
  
  const provider = await createTaskProvider(workspacePath);
  const tasks = await provider.queryTasks({ track_id: trackId });
  await provider.close();

  let content = fs.readFileSync(absPlanPath, 'utf8');
  const lines = content.split('\n');
  let updatedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*Task:\s*(.*?)(?:\s*\[TIER-\d+\]|\s*\[AGENT:.*?\]|$)/);
    if (match) {
      const title = match[3].trim();
      const task = tasks.find(t => t.title === title);
      
      if (task) {
        if (task.status === 'completed' && match[2] === ' ') {
           lines[i] = line.replace(/^(\s*)-\s*\[\s*\]/, '$1- [x]');
           updatedCount++;
        } else if (task.status !== 'completed' && match[2].toLowerCase() === 'x') {
           lines[i] = line.replace(/^(\s*)-\s*\[[xX]\]/, '$1- [ ]');
           updatedCount++;
        }
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(absPlanPath, lines.join('\n'));
    console.log(`Synced ${updatedCount} tasks in ${planPath}`);
  } else {
    console.log(`No updates needed for ${planPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
