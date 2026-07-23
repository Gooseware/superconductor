import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TrackEntry {
  trackId: string;
  name: string;
  status: 'completed' | 'in_progress' | 'planned';
  link: string;
  note?: string;
}

export interface PlanTask {
  title: string;
  completed: boolean;
  tier?: string;
  agent?: string;
  subtasks: PlanTask[];
  lineIndex: number;
}

export interface CriterionItem {
  id: string;
  text: string;
  checked: boolean;
  category?: string;
}

export function readTrackRegistry(projectRoot: string): TrackEntry[] {
  const tracksPath = path.join(projectRoot, 'superconductor', 'tracks.md');
  if (!fs.existsSync(tracksPath)) return [];

  const content = fs.readFileSync(tracksPath, 'utf-8');
  const entries: TrackEntry[] = [];
  const regex = /-\s*\[([ x~])\]\s*\*\*Track:\s*([^*]+)\*\*(?:\s*\*(.*?)\*)?\s*\n\*Link:\s*\[([^\]]+)\]\(([^)]+)\)\*/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const rawStatus = match[1];
    const name = match[2].trim();
    const note = match[3] ? match[3].trim() : undefined;
    const rawLink = match[5].trim();

    let status: TrackEntry['status'] = 'planned';
    if (rawStatus === 'x') status = 'completed';
    else if (rawStatus === '~') status = 'in_progress';

    // Extract trackId from link like ./tracks/core_harness_abstraction_20260723/
    const trackIdMatch = rawLink.match(/tracks\/([^/]+)/);
    const trackId = trackIdMatch ? trackIdMatch[1] : name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    entries.push({
      trackId,
      name,
      status,
      link: rawLink,
      note
    });
  }

  return entries;
}

export function readPlan(projectRoot: string, trackId: string): PlanTask[] {
  const planPath = path.join(projectRoot, 'superconductor', 'tracks', trackId, 'plan.md');
  if (!fs.existsSync(planPath)) return [];

  const content = fs.readFileSync(planPath, 'utf-8');
  const lines = content.split('\n');
  const tasks: PlanTask[] = [];
  let currentParent: PlanTask | null = null;

  lines.forEach((line, index) => {
    const taskMatch = line.match(/^(\s*)-\s*\[([ x])\]\s*(.*)$/);
    if (!taskMatch) return;

    const indent = taskMatch[1].length;
    const completed = taskMatch[2] === 'x';
    const rawTitle = taskMatch[3].trim();

    // Extract [TIER-N] and [AGENT:xxx] annotations
    const tierMatch = rawTitle.match(/\[(TIER-\d+)\]/);
    const agentMatch = rawTitle.match(/\[(AGENT:[^\]]+)\]/);
    const title = rawTitle.replace(/\[TIER-\d+\]/, '').replace(/\[AGENT:[^\]]+\]/, '').trim();

    const task: PlanTask = {
      title,
      completed,
      tier: tierMatch ? tierMatch[1] : undefined,
      agent: agentMatch ? agentMatch[1] : undefined,
      subtasks: [],
      lineIndex: index
    };

    if (indent === 0) {
      tasks.push(task);
      currentParent = task;
    } else if (currentParent) {
      currentParent.subtasks.push(task);
    } else {
      tasks.push(task);
    }
  });

  return tasks;
}

export function getAcceptanceCriteria(projectRoot: string, trackId: string): CriterionItem[] {
  const specPath = path.join(projectRoot, 'superconductor', 'tracks', trackId, 'spec.md');
  if (!fs.existsSync(specPath)) return [];

  const content = fs.readFileSync(specPath, 'utf-8');
  const criteria: CriterionItem[] = [];
  const regex = /-\s*\[([ x])\]\s*(.*)$/gm;

  let match;
  let count = 0;
  while ((match = regex.exec(content)) !== null) {
    count++;
    criteria.push({
      id: `AC-${count}`,
      text: match[2].trim(),
      checked: match[1] === 'x'
    });
  }

  return criteria;
}
