import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTaskProvider } from '../packages/task-store/src/providers/task-provider-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function normalizeTitle(rawTitle: string): string {
    let title = rawTitle;
    
    // 1. Strip Task: case-insensitively at the start
    title = title.replace(/^\s*task:\s*/i, '');
    
    // 2. Strip markdown bolding (**) and italics (*, _)
    title = title
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1');
    
    // 3. Strip Task: case-insensitively again (in case it was inside the bolding)
    title = title.replace(/^\s*task:\s*/i, '');
    
    // 4. Strip metadata tags ([TIER-...], [AGENT:...], [checkpoint:...]) globally
    title = title.replace(/(?:\s*\[TIER-[^\]]*\]|\s*\[AGENT:[^\]]*\]|\s*\[checkpoint:[^\]]*\])/gi, '');
    
    // 5. Trim whitespace
    return title.trim();
}

export function processPlan(content: string, tasks: any[]): { content: string, updatedCount: number } {
    const lines = content.split('\n');
    let updatedCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match "- [ ]" or "- [x]" with optional "Task:"
        const match = line.match(/^(\s*)-\s*\[([^\]])\]\s*(?:Task:\s*)?(.*)$/);
        if (match) {
            const checkboxState = match[2].toLowerCase(); // 'x', ' '
            const rawTitle = match[3];
            
            // Only proceed if it looks like a checkbox space or x
            if (checkboxState !== ' ' && checkboxState !== 'x') {
                continue;
            }

            const title = normalizeTitle(rawTitle);
            const task = tasks.find((t: any) => t.title === title);
            
            if (task) {
                if (task.status === 'completed' && checkboxState === ' ') {
                   lines[i] = line.replace(/^(\s*)-\s*\[\s*\]/, '$1- [x]');
                   updatedCount++;
                } else if (task.status !== 'completed' && checkboxState === 'x') {
                   lines[i] = line.replace(/^(\s*)-\s*\[[xX]\]/, '$1- [ ]');
                   updatedCount++;
                }
            }
        }
    }
    return { content: lines.join('\n'), updatedCount };
}

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
  
  const { content: newContent, updatedCount } = processPlan(content, tasks);

  if (updatedCount > 0) {
    fs.writeFileSync(absPlanPath, newContent);
    console.log(`Synced ${updatedCount} tasks in ${planPath}`);
  } else {
    console.log(`No updates needed for ${planPath}`);
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
