import { z } from 'zod';

export const RESERVED_PHASE_IDS = ['archive', 'default-archive'] as const;

export type ReservedPhaseId = (typeof RESERVED_PHASE_IDS)[number];

export const phaseStatusSchema = z.enum(['planned', 'active', 'blocked', 'completed']);
export type PhaseStatus = z.infer<typeof phaseStatusSchema>;

export const trackItemStatusSchema = z.enum(['completed', 'in_progress', 'planned']);
export type TrackItemStatus = z.infer<typeof trackItemStatusSchema>;

/**
 * Validates a symbolic phase ID against security and formatting constraints:
 * - Length between 1 and 64 characters
 * - Characters matching /^[a-z0-9_-]{1,64}$/
 * - No path traversal sequences (..)
 * - No path separators (/ or \)
 * - No null bytes (\0)
 * - Not a reserved identifier ('archive', 'default-archive')
 */
export function validatePhaseId(phaseId: string): { valid: boolean; error?: string } {
  if (!phaseId || typeof phaseId !== 'string') {
    return { valid: false, error: 'Phase ID must be a non-empty string' };
  }
  if (phaseId.length > 64) {
    return { valid: false, error: 'Phase ID must be at most 64 characters' };
  }
  if (phaseId.includes('\0')) {
    return { valid: false, error: 'Phase ID cannot contain null bytes' };
  }
  if (phaseId.includes('..')) {
    return { valid: false, error: 'Phase ID cannot contain path traversal sequences (..)' };
  }
  if (phaseId.includes('/') || phaseId.includes('\\')) {
    return { valid: false, error: 'Phase ID cannot contain path separators' };
  }
  if ((RESERVED_PHASE_IDS as readonly string[]).includes(phaseId)) {
    return { valid: false, error: `Phase ID '${phaseId}' is a reserved name` };
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(phaseId)) {
    return { valid: false, error: 'Phase ID must match /^[a-z0-9_-]{1,64}$/' };
  }
  return { valid: true };
}

export function isPhaseIdValid(phaseId: string): boolean {
  return validatePhaseId(phaseId).valid;
}

export const phaseIdSchema = z.string()
  .min(1, 'Phase ID cannot be empty')
  .max(64, 'Phase ID must be at most 64 characters')
  .superRefine((id, ctx) => {
    const result = validatePhaseId(id);
    if (!result.valid && result.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error,
      });
    }
  });

export const phaseTrackItemSchema = z.object({
  trackId: z.string().min(1, 'Track ID cannot be empty'),
  title: z.string().min(1, 'Title cannot be empty'),
  status: trackItemStatusSchema,
  branch: z.string().optional(),
  link: z.string().optional(),
  note: z.string().optional(),
});

export interface PhaseTrackItem {
  trackId: string;
  title: string;
  status: 'completed' | 'in_progress' | 'planned';
  branch?: string;
  link?: string;
  note?: string;
}

export const phaseItemSchema = z.object({
  phaseId: phaseIdSchema,
  name: z.string().min(1, 'Phase name cannot be empty'),
  status: phaseStatusSchema,
  ordinal: z.number().int().positive().optional(),
  tracks: z.array(phaseTrackItemSchema),
});

export interface PhaseItem {
  phaseId: string;       // sanitized symbolic ID, e.g. "core-foundation"
  name: string;          // human-readable name, e.g. "Core Foundation"
  status: PhaseStatus;
  ordinal?: number;      // dynamic runtime ordinal (1, 2, 3...)
  tracks: PhaseTrackItem[];
}

export const absorbedTrackSchema = z.object({
  trackId: z.string().min(1, 'Track ID cannot be empty'),
  absorbedBy: z.string().min(1, 'absorbedBy cannot be empty'),
  reason: z.string().min(1, 'reason cannot be empty'),
});

export interface AbsorbedTrackItem {
  trackId: string;
  absorbedBy: string;
  reason: string;
}

export const registryManifestSchema = z.object({
  phases: z.array(phaseItemSchema),
  absorbed: z.array(absorbedTrackSchema).optional(),
  archived: z.array(z.string().min(1)).optional(),
});

export interface RegistryManifest {
  phases: PhaseItem[];
  absorbed?: { trackId: string; absorbedBy: string; reason: string }[];
  archived?: string[];
}

// Alias for PhaseManifest
export const phaseManifestSchema = registryManifestSchema;
export type PhaseManifest = RegistryManifest;

export function parsePhaseManifest(data: unknown): RegistryManifest {
  return registryManifestSchema.parse(data);
}

export function safeParsePhaseManifest(data: unknown): z.SafeParseReturnType<unknown, RegistryManifest> {
  return registryManifestSchema.safeParse(data);
}
