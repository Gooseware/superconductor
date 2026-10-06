import { z } from 'zod';

export const proposalCategorySchema = z.enum(['process', 'codebase']);
export type ProposalCategory = z.infer<typeof proposalCategorySchema>;

export const proposalStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const trackProposalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: proposalCategorySchema,
  origin: z.string().optional(),
  sourceTrackId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  tags: z.array(z.string()).default([]),
  status: proposalStatusSchema.default('proposed'),
  createdAt: z.string().optional(),
  problemStatement: z.string().min(1),
  proposedScope: z.string().min(1),
  affectedFiles: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

export type TrackProposal = z.infer<typeof trackProposalSchema>;
