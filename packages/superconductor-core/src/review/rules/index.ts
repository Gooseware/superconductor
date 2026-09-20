export * from './types.js';
export * from './output-message-quality.js';
export * from './terminology-consistency.js';
export * from './instruction-clarity.js';
export * from './visual-hierarchy.js';
export * from './cognitive-load.js';
export * from './schema-ergonomics.js';
export * from './emoji-usage.js';
export * from './simplification.js';

import { UxRule } from './types.js';
import { outputMessageQualityRules } from './output-message-quality.js';
import { terminologyConsistencyRules } from './terminology-consistency.js';
import { instructionClarityRules } from './instruction-clarity.js';
import { visualHierarchyRules } from './visual-hierarchy.js';
import { cognitiveLoadRules } from './cognitive-load.js';
import { schemaErgonomicsRules } from './schema-ergonomics.js';
import { emojiUsageRules } from './emoji-usage.js';
import { simplificationRules } from './simplification.js';

export const ALL_UX_RULES: UxRule[] = [
  ...outputMessageQualityRules,
  ...terminologyConsistencyRules,
  ...instructionClarityRules,
  ...visualHierarchyRules,
  ...cognitiveLoadRules,
  ...schemaErgonomicsRules,
  ...emojiUsageRules,
  ...simplificationRules
];
