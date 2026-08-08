import { z } from 'zod';

export const FindingSchema = z.object({
  file: z.string().optional(),
}).catchall(z.any());

export const RemediationStateObjectSchema = z.object({
  findingIndex: z.record(FindingSchema),
  domainAssignments: z.record(z.array(z.string())),
  retryCount: z.record(z.number()),
  deepResearchResults: z.record(z.string()),
  fixedFindings: z.array(z.string()),
  failedFindings: z.array(z.string()),
  outcome: z.enum(['RESOLVED', 'ESCALATED', 'HUMAN_REQUIRED', 'IN_PROGRESS']),
  tokenUsage: z.record(z.number()).optional(),
  fixCommitSha: z.string().optional(),
  fixCommitShas: z.record(z.string()).optional()
});

export type RemediationStateObject = z.infer<typeof RemediationStateObjectSchema>;
