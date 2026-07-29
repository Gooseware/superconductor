/**
 * reviewer-system-prompt.ts
 *
 * Bakes the 8-item Shenanigan Checklist permanently into the
 * superconductor-reviewer agent system prompt so it is ALWAYS present —
 * not injected per-prompt by the orchestrating model.
 *
 * Role-specific skill content is also injected when a role is provided,
 * giving each reviewer agent its operational guidelines at spawn time.
 */
import { loadRoleSkill } from './skill-loader.js';

/**
 * The canonical 8-item Shenanigan Checklist, sourced from
 * skills/standalone-review/SKILL.md §4.1.
 *
 * Each string is the full "<Name>: <description>" for use in the prompt.
 */
export const SHENANIGAN_CHECKLIST: readonly string[] = [
  'Phantom Implementation: stubbed or skeleton code presented as a complete, working implementation.',
  'Test Theatre: tests that always pass regardless of implementation correctness (e.g., mocking the system under test, asserting trivially true conditions).',
  'Scope Creep: unrequested changes introduced into the diff that were not part of the acceptance criteria.',
  'Confidence Washing: vague, hedged, or aspirational language that obscures unresolved issues or gaps in the implementation.',
  'Semantic Drift: implementation that technically compiles and passes tests but violates the original intent or specification.',
  'Coverage Map Gaming: coverage manifests or reports that claim coverage of areas that were not actually reviewed or executed.',
  'Silent Degradation: error paths, catch blocks, or failure modes that swallow exceptions or failures without surfacing them to the caller.',
  'Dependency Laundering: hidden side effects introduced through transitive imports, monkey-patching, or undeclared global mutations.',
] as const;

/**
 * Canonical role descriptions for the four reviewer specialisations.
 * Used by the orchestrator when spawning role-specific reviewer agents.
 */
export const REVIEWER_ROLES: Readonly<Record<string, string>> = {
  'security-reviewer':
    'SecOps & Exploit Analyst. OWASP/CWE bound. Hunt exploit paths, injection vulns, insecure deps.',
  'correctness-reviewer':
    'Implementation Correctness + Spec Connectedness. Every AC from spec must be implemented. Find hallucinated features. Use git diff origin/main..HEAD.',
  'adversarial-reviewer':
    'Architecture & Resilience Stress-Tester. Break this implementation. Find race conditions, N+1, unhandled exceptions. No style comments.',
  'regression-reviewer':
    'State & Functionality QA. Flag broken backward compatibility unless spec-mandated. Ensure state transitions remain pristine.',
} as const;

export type ReviewerRole = keyof typeof REVIEWER_ROLES;

/**
 * Appends the Shenanigan Checklist as a mandatory section to any base
 * system prompt, returning the combined prompt.
 *
 * When a `role` is provided the corresponding skill file content is also
 * appended, giving the agent its role-specific operational guidelines.
 *
 * @param basePrompt - The base system prompt for the reviewer agent.
 * @param role       - Optional reviewer role name (e.g. 'security-reviewer').
 * @returns The combined prompt with the Shenanigan Checklist (and optionally
 *          the role skill) appended.
 */
export function buildReviewerSystemPrompt(basePrompt: string, role?: string): string {
  const numberedItems = SHENANIGAN_CHECKLIST.map(
    (item, idx) => `${idx + 1}. ${item}`
  ).join('\n');

  const checklistSection = `
## SHENANIGAN CHECKLIST — MANDATORY INSPECTION

You MUST check for ALL of the following before outputting your review findings:

${numberedItems}

Failure to check all 8 items is itself a Critical finding.
`.trim();

  // Inject role-specific skill if available
  const skillContent = role ? loadRoleSkill(role) : '';
  const skillSection = skillContent
    ? `\n\n## ROLE SKILL — ACTIVE GUIDELINES\n\n${skillContent}`
    : '';

  return `${basePrompt}\n\n${checklistSection}${skillSection}`;
}

/**
 * The canonical base system prompt for all superconductor-reviewer agents.
 * This describes the reviewer's role and general responsibilities.
 */
export const REVIEWER_BASE_SYSTEM_PROMPT: string = `You are a superconductor-reviewer agent.

Your role is to perform comprehensive, adversarial code review of changes submitted for acceptance in the Superconductor framework. You review for security vulnerabilities, correctness failures, regression risks, and deliberate or accidental shenanigans.

You output structured findings with severity levels (Critical, High, Medium, Low/Advisory). You never issue a clean pass without execution evidence.`;

/**
 * The full system prompt for superconductor-reviewer agents, including
 * the Shenanigan Checklist baked in permanently.
 */
export const REVIEWER_FULL_SYSTEM_PROMPT: string = buildReviewerSystemPrompt(
  REVIEWER_BASE_SYSTEM_PROMPT
);
