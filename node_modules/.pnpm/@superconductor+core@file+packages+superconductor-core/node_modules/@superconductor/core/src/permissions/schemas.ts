import { z } from 'zod';

export const PermissionStateSchema = z.enum(['IDLE', 'TRACKED', 'YOLO']);
export type PermissionState = z.infer<typeof PermissionStateSchema>;

export const InlineOverrideChoiceSchema = z.enum([
  'allow_once',
  'allow_track',
  'yolo_session',
  'deny'
]);
export type InlineOverrideChoice = z.infer<typeof InlineOverrideChoiceSchema>;

export const CapabilityFlagsSchema = z.object({
  usb_access: z.boolean(),
  arbitrary_shell: z.boolean(),
  network_unrestricted: z.boolean(),
  fs_outside_root: z.boolean(),
  persistent: z.boolean()
});
export type CapabilityFlags = z.infer<typeof CapabilityFlagsSchema>;

export const AllowlistSchema = z.object({
  shell_prefixes: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  paths: z.array(z.string()).default([])
});
export type Allowlist = z.infer<typeof AllowlistSchema>;

export const PermissionManifestSchema = z.object({
  meta: z.object({
    track_id: z.string(),
    generated_at: z.string(),
    inferred_by: z.enum(['auto', 'manual'])
  }),
  capabilities: CapabilityFlagsSchema,
  allowlist: AllowlistSchema.default({
    shell_prefixes: [],
    domains: [],
    paths: []
  })
});
export type PermissionManifest = z.infer<typeof PermissionManifestSchema>;

export const SessionFlagsSchema = z.object({
  yolo: z.boolean(),
  activatedAt: z.string(),
  sessionId: z.string(),
  persistent: z.boolean()
});
export type SessionFlags = z.infer<typeof SessionFlagsSchema>;
