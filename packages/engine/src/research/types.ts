import { z } from 'zod';

export interface IResearchQuery {
  term: string;
  intent?: string;
}

export const ResearchSourceSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  content: z.string().optional()
});

export interface IResearchSource extends z.infer<typeof ResearchSourceSchema> {}

export interface IResearchProvider {
  search(query: IResearchQuery): Promise<IResearchSource[]>;
}

export interface IContextInjector<T> {
  inject(context: T): Promise<void> | void;
}

export type FindingCategory =
  | "OSS_DISCOVERY"
  | "WHITE_PAPER"
  | "ARCHITECTURAL_PATTERN"
  | "SECURITY_CONSIDERATION"
  | "COMMUNITY_PATTERN";

export interface ResearchFinding {
  category: FindingCategory;
  description: string;
  sourceUrl?: string;
}

export const ResearchFindingSchema = z.object({
  category: z.enum([
    "OSS_DISCOVERY",
    "WHITE_PAPER",
    "ARCHITECTURAL_PATTERN",
    "SECURITY_CONSIDERATION",
    "COMMUNITY_PATTERN"
  ]),
  description: z.string(),
  sourceUrl: z.string().optional()
}).strict();

export const ResearchBriefSchema = z.object({
  trackId: z.string(),
  generatedAt: z.string().datetime(),
  queriesExecuted: z.array(z.string()),
  executiveSummary: z.string().refine((val) => val.trim().split(/\s+/).length <= 400, {
    message: "Executive summary must be 400 words or less"
  }),
  keyFindings: z.array(ResearchFindingSchema),
  recommendedPatterns: z.array(z.string()),
  antiPatterns: z.array(z.string()),
  skillsAlreadyInstalled: z.array(z.string()),
  artifactPointers: z.array(z.string())
}).strict();

export interface IResearchBrief extends z.infer<typeof ResearchBriefSchema> {}
