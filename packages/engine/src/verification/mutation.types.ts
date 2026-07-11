export interface SurvivingMutant {
  id: string;
  mutatorName: string;
  fileName: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
  replacement: string;
}

export interface MutationScore {
  total: number;
  killed: number;
  survived: number;
  score: number; // 0-100
}

export interface MutationReport {
  score: MutationScore;
  survivingMutants: SurvivingMutant[];
  suggestions: string[];
}

export interface MutationEvent {
  subType: 'mutation_testing';
  timestamp: number;
  taskId: string;
  report: MutationReport;
}
