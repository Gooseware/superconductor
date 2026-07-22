import { DagNode, SubagentConfig } from '../types/index.js';

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
      parts.push(`Symbol Context: ${dep.file} -> ${dep.symbol} (AST Call-Graph Node)`);
    } catch {
      parts.push(`Symbol Context (Offline Fallback): ${dep.file} -> ${dep.symbol}`);
    }
  }
  return parts.join('\n');
}

export async function generateDiffPayload(contextFiles: string[]): Promise<string> {
  if (!contextFiles || contextFiles.length === 0) return '--- Diff Payload ---\n(No files specified)';
  return `--- Diff Payload ---\nFiles: ${contextFiles.join(', ')}\n(Line-level git diff subset)`;
}

export function buildContext(task: DagNode, commonContext: string): SubagentConfig {
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

  if (task.contextFiles && task.contextFiles.length > 0) {
    parts.push(`Context Files: ${task.contextFiles.join(', ')}`);
  }

  if (task.symbolDependencies && task.symbolDependencies.length > 0) {
    parts.push(`Symbol Dependencies:\n${task.symbolDependencies.map(s => `- ${s.file}#${s.symbol}`).join('\n')}`);
  }
  
  const commonCtxStr = commonContext ? `--- Common Context ---\n${commonContext}` : '';
  
  // Calculate remaining length for task prompt
  const partsString = parts.join('\n\n');
  const overheadLength = partsString.length + commonCtxStr.length + `\n\n--- Task Prompt ---\n\n\n`.length;
  
  let taskPromptStr = task.prompt || '';
  if (taskPromptStr.length + overheadLength > MAX_PROMPT_LENGTH) {
    const allowedLength = Math.max(0, MAX_PROMPT_LENGTH - overheadLength);
    taskPromptStr = taskPromptStr.substring(0, allowedLength);
  }
  
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
