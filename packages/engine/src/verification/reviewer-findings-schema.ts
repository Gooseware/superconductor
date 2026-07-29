import { z } from 'zod';

export const FindingSchema = z.object({
  finding_id: z.string().optional(),
  severity: z.enum(['critical', 'advisory']),
  description: z.string(),
  recommendation: z.string().optional(),
  file: z.string().optional(),
  line_range: z.string().optional(),
});

export const ReviewerFindingsResolvedSchema = z.object({
  status: z.literal('RESOLVED'),
});

export const ReviewerFindingsFailedSchema = z.object({
  severity: z.enum(['CRITICAL', 'ADVISORY']),
  findings: z.array(z.union([FindingSchema, z.string()])).min(1),
});

export const ReviewerFindingsSchema = z.discriminatedUnion('status', [
  ReviewerFindingsResolvedSchema,
  // For FAILED, we use a separate parse since it has no 'status' field
]).or(ReviewerFindingsFailedSchema);

export type ReviewerFindings = z.infer<typeof ReviewerFindingsSchema>;
export type ReviewerFindingsResolved = z.infer<typeof ReviewerFindingsResolvedSchema>;
export type ReviewerFindingsFailed = z.infer<typeof ReviewerFindingsFailedSchema>;

export function isResolved(findings: ReviewerFindings): findings is ReviewerFindingsResolved {
  return 'status' in findings && findings.status === 'RESOLVED';
}
