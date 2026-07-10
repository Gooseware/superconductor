import { DagNode, SubagentConfig } from '../types';

const MAX_PROMPT_LENGTH = 100000;

export function buildContext(task: DagNode, commonContext: string): SubagentConfig {
  let prompt = `Task ID: ${task.id}\n`;
  prompt += `Role: ${task.role}\n`;
  
  if (task.contextFiles && task.contextFiles.length > 0) {
    prompt += `Context Files: ${task.contextFiles.join(', ')}\n`;
  }
  
  prompt += `\n--- Task Description ---\n${task.prompt}\n`;
  prompt += `\n--- Common Context ---\n${commonContext}\n`;

  // Enforce basic max length rule on generated prompt
  if (prompt.length > MAX_PROMPT_LENGTH) {
    prompt = prompt.substring(0, MAX_PROMPT_LENGTH);
  }

  return {
    agentName: task.id,
    role: task.role,
    tier: task.tier,
    prompt: prompt,
    workspace: 'inherit',
  };
}
