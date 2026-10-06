/**
 * Invariant-First Remediation Protocol & Dogma
 *
 * Defines the core dogma rules and prompt interpolators injected into
 * processor and remediator subagents to prevent local-patch pathologies.
 */

export const INVARIANT_REMEDIATION_DOGMA = `## INVARIANT-FIRST REMEDIATION PROTOCOL & DOGMA

All remediator processors MUST adhere to the following non-negotiable invariants:

1. INCEPTION MANDATE (No Call-Site Defensive Nulling):
   - Strictly FORBID call-site defensive nulling (?? 0, || [], ?? '', ?., or empty catch {}) when handling missing or unhydrated data at consumer sites.
   - Remediators MUST trace backward to the data lifecycle inception point (store initializer, migration script, ingestion pipeline, schema parser) and persist valid state at origin.
   - Missing data indicates an upstream integrity violation, not an optional value to mask.

2. ATOMIC DUAL-WRITE & SINGLE SOURCE OF TRUTH (SSOT):
   - State existing in two stores or representations must be updated atomically within a single transaction/action, or the redundant store eliminated.
   - Logging warnings on divergence (e.g. console.warn on store mismatch) while continuing execution is strictly classified as a fatal defect.

3. EXECUTION FIDELITY (Production Schema & Runtime Lifecycle):
   - Code must be tested against exact production migrations, SQLite CHECK constraints, foreign keys, and indexes.
   - For Cloudflare Workers and Durable Objects, asynchronous background work must always receive and invoke ctx.waitUntil, never dropping promises on bare env.

4. STRICT SEQUENCE MONOTONICITY:
   - State synchronization, polling, and CRDT handlers must enforce strict sequence monotonicity (headSeq > current.lastSeq).
   - Stale asynchronous network responses or out-of-order events must never overwrite newer real-time state.

5. ZERO TEST WEAKENING (Anti-Test-Theatre):
   - REJECT auto-generating test fixtures or snapshots on the fly (e.g. writeFileSync inside test files or assertions). Missing fixtures must fail immediately.
   - Replace wall-clock assertions (toBeLessThan(Xms)) with deterministic algorithmic operation counters (step counts, loop iterations, instruction counters).
   - Never increase timeout thresholds or relax assertion boundaries to mask performance regressions or race conditions.`;

export const DOMAIN_INCEPTION_HINTS: Record<string, string> = {
  data: 'Trace state mutations to database transactions, migration scripts, SQLite CHECK constraints, and foreign keys. Persist valid state at schema origin.',
  schema: 'Enforce schema invariants via production DDL migrations, strict column types, and foreign keys. Do not rely on application-level null guards.',
  'schema-remediator': 'Enforce schema invariants via production DDL migrations, strict column types, and foreign keys. Do not rely on application-level null guards.',
  logic: 'Trace unhydrated state back to lifecycle initializers, store bootstrapping, and state machine transitions. Ensure valid initial state at instantiation.',
  'logic-remediator': 'Trace unhydrated state back to lifecycle initializers, store bootstrapping, and state machine transitions. Ensure valid initial state at instantiation.',
  security: 'Trace credentials and token lifecycle to issuance and session creation. Enforce atomic revocation and fail-closed validation at ingress.',
  'security-remediator': 'Trace credentials and token lifecycle to issuance and session creation. Enforce atomic revocation and fail-closed validation at ingress.',
  test: 'Never weaken assertions or generate test fixtures dynamically. Replace wall-clock timing checks with deterministic step and operation counters.',
  'test-writer': 'Never weaken assertions or generate test fixtures dynamically. Replace wall-clock timing checks with deterministic step and operation counters.',
  frontend: 'Trace missing props or state to server hydration or root state stores. Do not swallow missing data with UI-level fallback masks.',
  'frontend-remediator': 'Trace missing props or state to server hydration or root state stores. Do not swallow missing data with UI-level fallback masks.',
  api: 'Trace unhandled inputs to ingress validation schemas. Ensure Cloudflare Workers handlers pass background tasks to ctx.waitUntil.',
  'api-remediator': 'Trace unhandled inputs to ingress validation schemas. Ensure Cloudflare Workers handlers pass background tasks to ctx.waitUntil.',
  config: 'Validate configuration and environment variables at process bootstrap/inception. Do not use silent fallbacks for required settings.',
  'config-remediator': 'Validate configuration and environment variables at process bootstrap/inception. Do not use silent fallbacks for required settings.',
  types: 'Model exact domain contracts with strict types. Eliminate loose any/unknown casts that hide uninitialized or invalid states.',
  'types-remediator': 'Model exact domain contracts with strict types. Eliminate loose any/unknown casts that hide uninitialized or invalid states.',
};

export function getDomainInceptionHint(domain?: string): string | undefined {
  if (!domain) return undefined;
  const normalized = domain.toLowerCase().trim();
  return (
    DOMAIN_INCEPTION_HINTS[normalized] ||
    DOMAIN_INCEPTION_HINTS[normalized.replace(/-remediator$/, '')] ||
    DOMAIN_INCEPTION_HINTS[`${normalized}-remediator`]
  );
}

export interface RemediationPromptOptions {
  domain?: string;
  hints?: string[];
  findings?: Array<{ file?: string; description?: string; severity?: string; ruleId?: string }>;
}

export function buildRemediationSystemPrompt(
  basePrompt: string,
  domainOrOptions?: string | RemediationPromptOptions
): string {
  const options: RemediationPromptOptions =
    typeof domainOrOptions === 'string'
      ? { domain: domainOrOptions }
      : domainOrOptions || {};

  const parts: string[] = [];

  const trimmedBase = basePrompt ? basePrompt.trim() : '';
  if (trimmedBase) {
    parts.push(trimmedBase);
  }

  parts.push(INVARIANT_REMEDIATION_DOGMA);

  // Domain-specific inception hint
  if (options.domain) {
    const hint = getDomainInceptionHint(options.domain);
    if (hint) {
      parts.push(`### Domain Inception Guidance (${options.domain})\n${hint}`);
    }
  }

  // Extra hints
  if (options.hints && options.hints.length > 0) {
    parts.push(`### Remediation Hints\n${options.hints.map((h) => `- ${h}`).join('\n')}`);
  }

  // Findings if provided
  if (options.findings && options.findings.length > 0) {
    const findingsSummary = options.findings
      .map(
        (f) =>
          `- [${f.severity || 'INFO'}] ${f.file || 'unknown'}: ${f.description || ''} ${f.ruleId ? `(${f.ruleId})` : ''}`.trim()
      )
      .join('\n');
    parts.push(`### Assigned Findings\n${findingsSummary}`);
  }

  return parts.join('\n\n');
}
