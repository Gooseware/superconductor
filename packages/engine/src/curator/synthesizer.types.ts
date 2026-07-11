export interface PatternMatch {
  patternType: 'MANUAL_INTERVENTION' | 'ESCALATION_TRIGGER' | 'BOILERPLATE_SEQUENCE';
  frequency: number;
  confidence: number; // 0.0 to 1.0
  description: string;
  relatedTaskIds: string[];
}

export interface SynthesizedSkill {
  name: string;
  description: string;
  systemPrompt: string;
  codeTemplates: string[];
  detectionSignals: string[];
  confidenceScore: number;
}

export interface ConfidenceScore {
  score: number; // 0.0 to 1.0
  factors: {
    frequency: number;
    recency: number;
    consistency: number;
  };
}

export interface SynthesisEvent {
  type: 'SKILL_SYNTHESIZED';
  skill: SynthesizedSkill;
  timestamp: string;
  trackId?: string;
}
