import * as yaml from 'js-yaml';
import { TaskGraph, DagNode, DagEdge, TaskRole, TaskTier } from '../types/dag.types.js';
import { validateTaskGraph, ValidationResult, ValidationError } from './validator.js';
import { findLineNumber } from './utils.js';

export interface RawTaskNode {
  id: string;
  name?: string;
  description?: string;
  role: string;
  tier: number;
  files?: string[];
  dependencies?: string[];
}

/**
 * Safely loads and validates the top-level YAML document structure.
 * Returns the parsed document or throws a ValidationResult on error.
 */
function parseYamlDocument(yamlContent: string): { tasks: RawTaskNode[] } {
  let doc: any;
  try {
    doc = yaml.load(yamlContent);
  } catch (e: any) {
    throw {
      success: false,
      errors: [{
        message: `YAML parse error: ${e.message}`,
        line: e.mark?.line ? e.mark.line + 1 : undefined,
        column: e.mark?.column ? e.mark.column + 1 : undefined
      }]
    } as ValidationResult;
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.tasks)) {
    throw {
      success: false,
      errors: [{ message: 'Invalid DAG format: missing "tasks" array at root', line: 1 }]
    } as ValidationResult;
  }

  return doc as { tasks: RawTaskNode[] };
}

/**
 * Validates a single raw task node and converts it to a DagNode + edges.
 * Returns errors if the node is invalid, or the constructed node and its edges.
 */
function validateRawTaskNode(
  rawNode: RawTaskNode,
  lines: string[]
): { errors: ValidationError[] } | { node: DagNode; edges: DagEdge[] } {
  if (!rawNode.id) {
    return { errors: [{ message: 'Task is missing required field "id"', line: 1, column: 1 }] };
  }

  const line = findLineNumber(lines, rawNode.id);
  const errors: ValidationError[] = [];

  if (!rawNode.role || !['architect', 'editor'].includes(rawNode.role)) {
    errors.push({ message: `Task ${rawNode.id} has invalid role: ${rawNode.role}`, line, column: 1 });
  }

  if (typeof rawNode.tier !== 'number' || ![1, 2, 3, 4].includes(rawNode.tier)) {
    errors.push({ message: `Task ${rawNode.id} has invalid tier: ${rawNode.tier}`, line, column: 1 });
  }

  if (errors.length > 0) {
    return { errors };
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

  const edges: DagEdge[] = (node.dependsOn || []).map(dep => ({ from: dep, to: node.id }));

  return { node, edges };
}

export function parseYamlDag(yamlContent: string): ValidationResult {
  let doc: { tasks: RawTaskNode[] };
  try {
    doc = parseYamlDocument(yamlContent);
  } catch (result) {
    return result as ValidationResult;
  }

  const lines = yamlContent.split('\n');
  const nodes: Record<string, DagNode> = {};
  const edges: DagEdge[] = [];
  const errors: ValidationError[] = [];

  for (const rawNode of doc.tasks) {
    const result = validateRawTaskNode(rawNode, lines);
    if ('errors' in result) {
      errors.push(...result.errors);
    } else {
      nodes[result.node.id] = result.node;
      edges.push(...result.edges);
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
