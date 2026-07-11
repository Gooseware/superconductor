export type RiskTier = 'auto-approve' | 'log-proceed' | 'human-required';

export interface RiskRule {
  pattern: string;
  tier: RiskTier;
  description?: string;
}

export interface RiskPolicy {
  defaultTier: RiskTier;
  rules: RiskRule[];
}

export interface RiskClassification {
  command: string;
  tier: RiskTier;
  ruleMatched?: RiskRule;
  timestamp: number;
}
