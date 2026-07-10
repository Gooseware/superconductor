import { DagNode, SubagentConfig } from '../types';

const MAX_PROMPT_LENGTH = 100000;

export function buildContext(task: DagNode, commonContext: string): SubagentConfig {
  let prompt = `Task ID: ${task.id}\n`;
  if (task.name) prompt += `Name: ${task.name}\n`;
  prompt += `Role: ${task.role}\n`;
  
  if (task.description) {
    prompt += `Description: ${task.description}\n`;
  }

  if (task.constraints && task.constraints.length > 0) {
    prompt += `Constraints:\n${task.constraints.map(c => `- ${c}`).join('\n')}\n`;
  }

  if (task.variables && Object.keys(task.variables).length > 0) {
    prompt += `Variables:\n`;
    for (const [key, value] of Object.entries(task.variables)) {
      prompt += `- ${key}: ${value}\n`;
    }
  }

  if (task.contextFiles && task.contextFiles.length > 0) {
    prompt += `Context Files: ${task.contextFiles.join(', ')}\n`;
  }
  
  prompt += `\n--- Task Prompt ---\n${task.prompt}\n`;
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
