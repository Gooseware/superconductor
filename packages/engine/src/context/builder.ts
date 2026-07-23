import { DagNode, SubagentConfig } from '../types/index.js';
import { execSync } from 'child_process';
import * as fs from 'fs';

const MAX_PROMPT_LENGTH = 100000;

export interface SymbolDependency {
  file: string;
  symbol: string;
}

export async function resolveSymbols(symbols: SymbolDependency[]): Promise<string> {
  if (!symbols || symbols.length === 0) return '';
  const parts: string[] = [];
  for (const dep of symbols) {
    try {
      if (fs.existsSync(dep.file)) {
        const content = fs.readFileSync(dep.file, 'utf8');
        const lines = content.split('\n');
        let matchedLine = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(dep.symbol)) {
            matchedLine = i + 1;
            break;
          }
        }
        if (matchedLine > 0) {
          const start = Math.max(0, matchedLine - 5);
          const end = Math.min(lines.length, matchedLine + 15);
          const snippet = lines.slice(start, end).join('\n');
          parts.push(`Symbol Context: ${dep.file} -> ${dep.symbol} (L${start + 1}-L${end}):\n${snippet}`);
          continue;
        }
      }
      parts.push(`Symbol Context: ${dep.file} -> ${dep.symbol} (AST Call-Graph Node)`);
    } catch {
      parts.push(`Symbol Context (Offline Fallback): ${dep.file} -> ${dep.symbol}`);
    }
  }
  return parts.join('\n');
}

export async function generateDiffPayload(contextFiles: string[]): Promise<string> {
  if (!contextFiles || contextFiles.length === 0) return '--- Diff Payload ---\n(No files specified)';
  try {
    const diff = execSync(`git diff HEAD -- ${contextFiles.join(' ')}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return `--- Diff Payload ---\n${diff || '(No diff detected)'}`;
  } catch {
    return `--- Diff Payload ---\nFiles: ${contextFiles.join(', ')}\n(Line-level git diff subset)`;
  }
}

/** Formats optional task metadata fields into a partial context string. */
export function formatTaskMetadata(task: DagNode): string {
  const parts: string[] = [];

  if (task.id) parts.push(`Task ID: ${task.id}`);
  if (task.name) parts.push(`Name: ${task.name}`);
  if (task.role) parts.push(`Role: ${task.role}`);

  if (task.description) {
    parts.push(`Description: ${task.description}`);
  }

  if (task.constraints && task.constraints.length > 0) {
    parts.push(`Constraints:\n${task.constraints.map((c: string) => `- ${c}`).join('\n')}`);
  }

  if (task.variables && Object.keys(task.variables).length > 0) {
    let vars = `Variables:\n`;
    const entries = Object.entries(task.variables);
    for (let i = 0; i < entries.length; i++) {
      vars += `- ${entries[i][0]}: ${entries[i][1]}`;
      if (i < entries.length - 1) vars += '\n';
    }
    parts.push(vars);
  }

  return parts.join('\n\n');
}

/** Formats the contextFiles and symbolDependencies sections into a dependency string. */
export function formatTaskDependencies(task: DagNode): string {
  const parts: string[] = [];

  if (task.contextFiles && task.contextFiles.length > 0) {
    parts.push(`Context Files: ${task.contextFiles.join(', ')}`);
  }

  if (task.symbolDependencies && task.symbolDependencies.length > 0) {
    parts.push(`Symbol Dependencies:\n${task.symbolDependencies.map(s => `- ${s.file}#${s.symbol}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

/** Truncates the task prompt so that the full assembled prompt stays within MAX_PROMPT_LENGTH. */
export function truncatePromptToBudget(
  prompt: string,
  overhead: number,
  maxTokens: number = MAX_PROMPT_LENGTH,
): string {
  if (prompt.length + overhead > maxTokens) {
    const allowedLength = Math.max(0, maxTokens - overhead);
    return prompt.substring(0, allowedLength);
  }
  return prompt;
}

export function buildContext(task: DagNode, commonContext: string): SubagentConfig {
  const parts: string[] = [];

  const metadata = formatTaskMetadata(task);
  if (metadata) parts.push(metadata);

  const dependencies = formatTaskDependencies(task);
  if (dependencies) parts.push(dependencies);

  // R5: Auto-inject diff payload for Reviewer tasks
  if (task.role === 'reviewer' && task.contextFiles && task.contextFiles.length > 0) {
    try {
      const diff = execSync(`git diff HEAD -- ${task.contextFiles.join(' ')}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      parts.push(`--- Diff Payload ---\n${diff || '(No diff detected)'}`);
    } catch {
      parts.push(`--- Diff Payload ---\nFiles: ${task.contextFiles.join(', ')}\n(Line-level git diff subset)`);
    }
  }

  const commonCtxStr = commonContext ? `--- Common Context ---\n${commonContext}` : '';

  // Calculate remaining length for task prompt
  const partsString = parts.join('\n\n');
  const overheadLength = partsString.length + commonCtxStr.length + `\n\n--- Task Prompt ---\n\n\n`.length;

  let taskPromptStr = task.prompt || '';
  taskPromptStr = truncatePromptToBudget(taskPromptStr, overheadLength);

  if (taskPromptStr) {
    parts.push(`--- Task Prompt ---\n${taskPromptStr}`);
  }

  if (commonCtxStr) {
    parts.push(commonCtxStr);
  }

  return {
    agentName: task.id || 'unknown',
    role: task.role || 'unknown',
    tier: task.tier || 1,
    prompt: parts.join('\n\n'),
    workspace: 'inherit',
  };
}
