import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPlan, PlanTask } from './track-reader.js';

export interface CompletionStats {
  trackId: string;
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}

export function checkTask(projectRoot: string, trackId: string, lineIndex: number): void {
  updateTaskCheckbox(projectRoot, trackId, lineIndex, true);
}

export function uncheckTask(projectRoot: string, trackId: string, lineIndex: number): void {
  updateTaskCheckbox(projectRoot, trackId, lineIndex, false);
}

function updateTaskCheckbox(projectRoot: string, trackId: string, lineIndex: number, check: boolean): void {
  const planPath = path.join(projectRoot, 'superconductor', 'tracks', trackId, 'plan.md');
  if (!fs.existsSync(planPath)) return;

  const content = fs.readFileSync(planPath, 'utf-8');
  const lines = content.split('\n');

  if (lineIndex < 0 || lineIndex >= lines.length) return;

  const targetChar = check ? 'x' : ' ';
  lines[lineIndex] = lines[lineIndex].replace(/-\s*\[[ x]\]/, `- [${targetChar}]`);

  fs.writeFileSync(planPath, lines.join('\n'), 'utf-8');
}

export function getCompletionStats(projectRoot: string, trackId: string): CompletionStats {
  const tasks = readPlan(projectRoot, trackId);
  let total = 0;
  let completed = 0;

  function countTasks(taskList: PlanTask[]) {
    for (const t of taskList) {
      total++;
      if (t.completed) completed++;
      if (t.subtasks && t.subtasks.length > 0) {
        countTasks(t.subtasks);
      }
    }
  }

  countTasks(tasks);

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    trackId,
    totalTasks: total,
    completedTasks: completed,
    percentComplete: percent
  };
}
