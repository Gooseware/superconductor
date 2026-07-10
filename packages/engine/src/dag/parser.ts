import * as yaml from 'js-yaml';
import { TaskGraph, DagNode, DagEdge, TaskRole, TaskTier } from '../types/dag.types';
import { validateTaskGraph, ValidationResult, ValidationError } from './validator';

export interface RawTaskNode {
  id: string;
  name?: string;
  description?: string;
  role: string;
  tier: number;
  files?: string[];
  dependencies?: string[];
}

function findLineNumber(yamlContent: string, id: string): number {
  const lines = yamlContent.split('\n');
  const index = lines.findIndex(line => line.includes(`id: ${id}`) || line.includes(`id: "${id}"`) || line.includes(`id: '${id}'`));
  return index >= 0 ? index + 1 : 1;
}

export function parseYamlDag(yamlContent: string): ValidationResult {
  let doc: any;
  try {
    doc = yaml.load(yamlContent);
  } catch (e: any) {
    return {
      success: false,
      errors: [{
        message: `YAML parse error: ${e.message}`,
        line: e.mark?.line ? e.mark.line + 1 : undefined,
        column: e.mark?.column ? e.mark.column + 1 : undefined
      }]
    };
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.tasks)) {
    return { success: false, errors: [{ message: 'Invalid DAG format: missing "tasks" array at root', line: 1 }] };
  }

  const nodes: Record<string, DagNode> = {};
  const edges: DagEdge[] = [];
  const errors: ValidationError[] = [];

  const rawTasks = doc.tasks as RawTaskNode[];

  for (const rawNode of rawTasks) {
    const line = findLineNumber(yamlContent, rawNode.id);

    if (!rawNode.id) {
      errors.push({ message: 'Task is missing required field "id"', line, column: 1 });
      continue;
    }

    if (!rawNode.role || !['architect', 'editor'].includes(rawNode.role)) {
      errors.push({ message: `Task ${rawNode.id} has invalid role: ${rawNode.role}`, line, column: 1 });
    }
    
    if (typeof rawNode.tier !== 'number' || ![1, 2, 3, 4].includes(rawNode.tier)) {
      errors.push({ message: `Task ${rawNode.id} has invalid tier: ${rawNode.tier}`, line, column: 1 });
    }

    const prompt = [rawNode.name, rawNode.description].filter(Boolean).join('\n');
    
    const node: DagNode = {
      id: rawNode.id,
      role: rawNode.role as TaskRole,
      tier: rawNode.tier as TaskTier,
      status: 'pending',
      prompt: prompt || rawNode.id,
      contextFiles: rawNode.files || [],
      dependsOn: rawNode.dependencies || []
    };

    nodes[node.id] = node;

    // Create edges
    if (node.dependsOn) {
      for (const dep of node.dependsOn) {
        edges.push({ from: dep, to: node.id });
      }
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const graph: TaskGraph = { nodes, edges };
  
  const validationErrors = validateTaskGraph(graph, yamlContent);
  if (validationErrors.length > 0) {
    return { success: false, errors: validationErrors };
  }

  return { success: true, graph };
}
