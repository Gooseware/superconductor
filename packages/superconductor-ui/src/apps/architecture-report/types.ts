import { RecommendationStrength } from '../../components/astryx/index.js';

export interface ArchitectureCandidateBenefit {
  locality?: string;
  depth?: string;
  leverage?: string;
  testability?: string;
}

export interface ArchitectureCandidateBeforeAfter {
  beforeDiagram?: string;
  afterDiagram?: string;
  beforeDescription?: string;
  afterDescription?: string;
}

export interface ArchitectureProposedTrack {
  trackId: string;
  title: string;
  description: string;
  filesAffected: string[];
}

export interface RefactoringCandidate {
  id: string;
  title: string;
  description: string;
  recommendation?: RecommendationStrength;
  recommendationStrength?: RecommendationStrength;
  partition?: string;
  couplingCluster?: string;
  estimatedTokenSavings?: string;
  redundantComponents?: string[];
  files?: string[];
  type?: string;
  domain?: string;
  benefits?: ArchitectureCandidateBenefit;
  beforeAfter?: ArchitectureCandidateBeforeAfter;
  beforeArchitecture?: string;
  afterArchitecture?: string;
  proposedTrack?: ArchitectureProposedTrack;
  targetTrackId?: string;
  suggestedTrackId?: string;
  suggestedAdapter?: string;
}

export interface SummaryMetrics {
  totalPartitions: number;
  candidateDeepenings: number;
  potentialTokenSavings: string;
  nonDryRedundancies: number;
}

export interface ArchitectureReportData {
  metrics: SummaryMetrics;
  candidates: RefactoringCandidate[];
  lastScanTimestamp?: string;
}
