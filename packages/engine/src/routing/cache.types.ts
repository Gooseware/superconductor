export type PromptSegmentPriority = 'static' | 'semi-static' | 'dynamic';

export interface PromptSegment {
  id: string;
  priority: PromptSegmentPriority;
  content: string;
  contentHash: string; // Used for cache invalidation
}

export interface CacheManifest {
  segments: PromptSegment[];
  totalPayloadHash: string;
}

export interface CacheHitReport {
  hitRatio: number; // percentage
  estimatedTokenSavings: number;
  invalidatedSegments: string[];
}
