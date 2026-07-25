import { z } from 'zod';

export const trackStatusSchema = z.enum([
  'planned',
  'in_progress',
  'completed',
  'pending',
  '[ ]',
  '[~]',
  '[x]',
  'x',
  '~'
]).transform((val) => {
  if (val === 'x' || val === '[x]' || val === 'completed') return 'completed';
  if (val === '~' || val === '[~]' || val === 'in_progress') return 'in_progress';
  return 'planned';
});

export const trackEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  status: trackStatusSchema.default('planned'),
  deps: z.array(z.string()).default([]),
  link: z.string().optional(),
  spec: z.string().optional(),
  plan: z.string().optional(),
  note: z.string().optional()
}).transform((data) => ({
  trackId: data.id,
  name: data.name || data.title || data.id,
  status: data.status,
  deps: data.deps,
  link: data.link || `./tracks/${data.id}/`,
  spec: data.spec || `./tracks/${data.id}/spec.md`,
  plan: data.plan || `./tracks/${data.id}/plan.md`,
  note: data.note
}));

export const trackManifestSchema = z.union([
  z.object({
    version: z.union([z.number(), z.string()]).optional(),
    tracks: z.array(trackEntrySchema).default([])
  }),
  z.array(trackEntrySchema).transform((tracks) => ({ tracks }))
]);

export type TrackManifest = z.infer<typeof trackManifestSchema>;
export type TrackEntryYaml = z.infer<typeof trackEntrySchema>;
