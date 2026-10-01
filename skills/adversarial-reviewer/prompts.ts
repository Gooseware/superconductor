/**
 * Adversarial Reviewer Prompts & Shenanigan Definitions
 *
 * Defines prompt additions and instructions for adversarial reviewer agents,
 * specifically Shenanigan #9 (Component Reinvention & Non-DRY Redundancy).
 */

export const SHENANIGAN_09_NAME = 'Component Reinvention & Non-DRY Redundancy';

export const SHENANIGAN_09_DESCRIPTION =
  'hand-rolling custom primitives, components, or helper functions that duplicate existing code in the repository symbol catalog or registered Golden Source components.';

export const SHENANIGAN_09_PROMPT = `
### Shenanigan: Component Reinvention & Non-DRY Redundancy
- **Check**: Inspect the diff for custom primitives, UI elements (buttons, cards, inputs, modals, tables), or helper functions (cloners, caches, tokens, formatters) that duplicate existing components in the repository symbol catalog (06_api_surface.toon) or registered Golden Source components (registry_items), or ignore declared REUSES: tags from plan.md.
- **Violation outcome**: Flag as NEEDS_FIXES citing Component Reinvention / Non-DRY Redundancy with severity: "high", category: "adversarial", shenanigan: "component-reinvention".
`.trim();

/**
 * Appends Shenanigan #9 prompt instructions to any reviewer prompt.
 */
export function buildAdversarialDryReviewerPrompt(basePrompt: string): string {
  return `${basePrompt}\n\n${SHENANIGAN_09_PROMPT}`;
}

export {
  checkComponentReinvention,
  extractFamily,
  type ComponentReinventionOptions,
  type ReinventionFinding,
  type ReinventionCheckResult,
} from './shenanigans/09-component-reinvention.js';
