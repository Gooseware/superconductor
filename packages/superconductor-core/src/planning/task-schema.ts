import { z } from 'zod';

/**
 * Zod schema for validated Task Metadata.
 * Defines the core metadata required for a planned task.
 */
export const TaskMetadataSchema = z.object({
  task: z.string().min(1, 'Task description cannot be empty'),
  tier: z.number().int().min(1).default(1),
  agent: z.string().default('superconductor-processor'),
  domain: z.string().default('default'),
  phase: z.number().int().min(0).default(0),
  creates: z.array(z.string()).default([]),
  protected: z.array(z.string()).default([]),
  invariantAfter: z.string().optional(),
  reuses: z.array(z.string()).default([]),
});

export type TaskMetadata = z.infer<typeof TaskMetadataSchema>;

/**
 * Zod schema for a full ParsedTaskCard, which includes TaskMetadata
 * plus plan-level attributes (id, completed status, subtasks, raw block).
 */
export const ParsedTaskCardSchema = TaskMetadataSchema.extend({
  id: z.string().optional(),
  completed: z.boolean().default(false),
  subtasks: z.array(z.string()).default([]),
  raw: z.string().optional(),
});

export type ParsedTaskCard = z.infer<typeof ParsedTaskCardSchema>;

/**
 * Type guard to check if an object satisfies TaskMetadata.
 */
export function isTaskMetadata(value: unknown): value is TaskMetadata {
  return TaskMetadataSchema.safeParse(value).success;
}

/**
 * Type guard to check if an object satisfies ParsedTaskCard.
 */
export function isParsedTaskCard(value: unknown): value is ParsedTaskCard {
  return ParsedTaskCardSchema.safeParse(value).success;
}
