import { z } from 'zod';

export const TrackStatusSchema = z.enum(['planned', 'in_progress', 'completed']);
export type TrackStatus = z.infer<typeof TrackStatusSchema>;

const TrackManifestInputSchema = z.object({
  id: z.string().optional(),
  status: TrackStatusSchema,
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  link: z.string().default(''),
  dependencies: z.array(z.string()).optional(),
  deps: z.array(z.string()).optional(),
  note: z.string().optional()
});

export const TrackManifestSchema = TrackManifestInputSchema.transform((data) => {
  const dependencies = data.dependencies ?? data.deps ?? [];
  const { deps, ...rest } = data;
  return {
    ...rest,
    description: data.description ?? '',
    link: data.link ?? '',
    dependencies
  };
});

export type TrackManifest = z.infer<typeof TrackManifestSchema>;

export const TracksManifestSchema = z.union([
  z.array(TrackManifestSchema),
  z.record(TrackManifestInputSchema)
]);

export function parseTrackManifest(data: unknown): TrackManifest {
  return TrackManifestSchema.parse(data);
}

export function parseTracksManifest(data: unknown): TrackManifest[] {
  if (Array.isArray(data)) {
    return z.array(TrackManifestSchema).parse(data);
  }

  if (data && typeof data === 'object') {
    const record = z.record(TrackManifestInputSchema).parse(data);
    return Object.entries(record).map(([trackId, item]) => {
      return TrackManifestSchema.parse({
        id: item.id ?? trackId,
        ...item
      });
    });
  }

  throw new Error('Invalid tracks manifest data: expected an array or object dictionary of tracks');
}
