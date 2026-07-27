import { z } from 'zod';

const nullToUndefined = (v: unknown) => (v === null ? undefined : v);

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
  name: z.preprocess(nullToUndefined, z.string().optional()),
  title: z.preprocess(nullToUndefined, z.string().optional()),
  status: z.preprocess(nullToUndefined, trackStatusSchema.default('planned')),
  deps: z.preprocess(nullToUndefined, z.array(z.string()).default([])),
  link: z.preprocess(nullToUndefined, z.string().optional()),
  spec: z.preprocess(nullToUndefined, z.string().optional()),
  plan: z.preprocess(nullToUndefined, z.string().optional()),
  note: z.preprocess(nullToUndefined, z.string().optional())
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
  z.preprocess(nullToUndefined, z.object({
    version: z.preprocess(nullToUndefined, z.union([z.number(), z.string()]).optional()),
    tracks: z.preprocess(nullToUndefined, z.array(trackEntrySchema).default([]))
  })),
  z.preprocess(nullToUndefined, z.array(trackEntrySchema).transform((tracks) => ({ tracks })))
]);

export type TrackManifest = z.infer<typeof trackManifestSchema>;
export type TrackEntryYaml = z.infer<typeof trackEntrySchema>;

