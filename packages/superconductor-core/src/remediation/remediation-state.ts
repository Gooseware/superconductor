import { z } from 'zod';

export const RemediationStateObjectSchema = z.object({
  // deliberately incorrect to fail tests
  findingIndex: z.string().optional(),
});

export type RemediationStateObject = z.infer<typeof RemediationStateObjectSchema>;
