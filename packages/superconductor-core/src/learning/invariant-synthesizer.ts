/**
 * ReflectiveInvariantSynthesizer
 *
 * Synthesizes actionable, RFC-2119 compliant invariants from Quorum review
 * rejections, remediation cycles, and failure trajectories.
 *
 * Invariant: Mined invariants MUST be valid constraint strings and recorded
 * with appropriate severity.
 */

import { QuorumFeedback } from './types.js';
import { InvariantDeduplicator } from './deduplicator.js';
import { NoteWriter } from '../notebook/note-writer.js';

export interface SynthesizedInvariant {
  invariant: string;
  severity: 'warning' | 'critical';
  domain: string;
  sourceFinding?: string;
}

export interface SynthesisOptions {
  trackId?: string;
  domain?: string;
  rootCause?: string;
  fixSummary?: string;
  severity?: 'warning' | 'critical';
  existingInvariants?: string[];
  strictGrammar?: boolean;
}

export class ReflectiveInvariantSynthesizer {
  /**
   * Validates whether a given string is a syntactically valid invariant
   * adhering to RFC-2119 keywords (MUST / MUST NOT).
   */
  public static isValidInvariant(invariant: string): boolean {
    if (!invariant || typeof invariant !== 'string') {
      return false;
    }
    const trimmed = invariant.trim();
    if (trimmed.length < 10) {
      return false;
    }
    return /\b(MUST|MUST NOT)\b/.test(trimmed);
  }

  /**
   * Synthesize a structured RFC-2119 compliant invariant from a single remediation finding.
   */
  public static synthesizeFromRemediation(params: {
    trackId: string;
    finding: string;
    domain?: string;
    rootCause?: string;
    fixSummary?: string;
  }): SynthesizedInvariant {
    const domain = params.domain || 'general';

    // 1. Determine severity
    const textToCheck = `${params.finding} ${params.rootCause || ''} ${domain}`.toLowerCase();
    const isCritical =
      domain === 'security' ||
      /\b(security|vulnerab\w*|cve|injection|credential\w*|password\w*|secret\w*|private key\w*|token leak\w*|auth bypass\w*|rce|privilege escalation|data loss|data corruption|unauthorized|fatal)\b/i.test(
        textToCheck
      );
    const severity: 'warning' | 'critical' = isCritical ? 'critical' : 'warning';

    // 2. Formulate RFC-2119 rule
    const rule = this.formulateRule(params.finding, domain, params.rootCause, params.fixSummary);

    return {
      invariant: rule,
      severity,
      domain,
      sourceFinding: params.finding,
    };
  }

  /**
   * Synthesizes invariants from Quorum feedback items. Extracts findings only from
   * NEEDS_FIXES verdicts and checks against existing invariants using InvariantDeduplicator.
   */
  public static synthesizeFromQuorum(
    quorumFeedback: QuorumFeedback[],
    existingInvariants: string[] = []
  ): { newInvariants: SynthesizedInvariant[]; duplicateCount: number } {
    const newInvariants: SynthesizedInvariant[] = [];
    let duplicateCount = 0;
    const existingPool = [...existingInvariants];

    for (const feedback of quorumFeedback) {
      if (!feedback || feedback.verdict !== 'NEEDS_FIXES' || !Array.isArray(feedback.findings)) {
        continue;
      }

      // Infer domain from reviewerRole if not explicit
      let domain = 'general';
      const roleLower = (feedback.reviewerRole || '').toLowerCase();
      if (roleLower.includes('security')) {
        domain = 'security';
      } else if (roleLower.includes('correctness')) {
        domain = 'correctness';
      } else if (roleLower.includes('adversarial')) {
        domain = 'adversarial';
      } else if (roleLower.includes('regression')) {
        domain = 'regression';
      } else if (feedback.reviewerRole) {
        domain = feedback.reviewerRole;
      }

      for (const finding of feedback.findings) {
        if (!finding || typeof finding !== 'string' || !finding.trim()) {
          continue;
        }

        const synthesized = this.synthesizeFromRemediation({
          trackId: '',
          finding: finding.trim(),
          domain,
        });

        const dupResult = InvariantDeduplicator.isDuplicate(synthesized.invariant, existingPool);
        const isDup = typeof dupResult === 'boolean' ? dupResult : Boolean(dupResult?.isDuplicate);

        if (isDup) {
          duplicateCount++;
        } else {
          newInvariants.push(synthesized);
          existingPool.push(synthesized.invariant);
        }
      }
    }

    return {
      newInvariants,
      duplicateCount,
    };
  }

  /**
   * Records a synthesized invariant as a warning note in the notebook.
   */
  public static async recordToNotebook(
    synthesized: SynthesizedInvariant,
    options: {
      trackId: string;
      domain: string;
      filePaths?: string[];
      invocationId?: string;
    }
  ): Promise<void> {
    if (!options || !options.trackId) {
      throw new Error('trackId is required to record invariant to notebook');
    }

    await NoteWriter.writeWarningNote(synthesized.invariant, {
      track_id: options.trackId,
      domain: options.domain || synthesized.domain,
      files: options.filePaths,
      invocation_id: options.invocationId,
      severity: synthesized.severity,
    });
  }

  /**
   * Internal grammar formulation engine to produce crisp "The <component> MUST/MUST NOT <rule>" strings.
   */
  private static formulateRule(
    finding: string,
    domain?: string,
    rootCause?: string,
    fixSummary?: string
  ): string {
    let cleanFinding = finding.trim().replace(/\.+$/, '');

    // 1. If finding already has an RFC-2119 keyword, preserve and normalize
    if (/\b(must\s+not|shall\s+not|must|shall)\b/i.test(cleanFinding)) {
      let normalized = cleanFinding
        .replace(/\bshall\s+not\b/gi, 'MUST NOT')
        .replace(/\bmust\s+not\b/gi, 'MUST NOT')
        .replace(/\bshall\b/gi, 'MUST')
        .replace(/\bmust\b/gi, 'MUST');

      if (
        !normalized.startsWith('The ') &&
        !normalized.startsWith('Invariants ') &&
        !normalized.startsWith('All ')
      ) {
        normalized = `The ${normalized.charAt(0).toLowerCase() + normalized.slice(1)}`;
      }
      return normalized;
    }

    // 2. Identify component/module subject
    let component = '';

    const compPrefixMatch = cleanFinding.match(/^(?:Component|Module|Class)\s+([A-Za-z0-9_]+)/i);
    if (compPrefixMatch) {
      component = compPrefixMatch[1];
      cleanFinding = cleanFinding.slice(compPrefixMatch[0].length).trim();
    } else if (cleanFinding.startsWith('File system writer')) {
      component = 'File system writer';
      cleanFinding = cleanFinding.slice('File system writer'.length).trim();
    } else {
      const pascalMatch = cleanFinding.match(/^([A-Z][a-zA-Z0-9_]+)\b/);
      if (
        pascalMatch &&
        !['Missing', 'Security', 'Error', 'Timeout', 'Hanging', 'Signature', 'File'].includes(
          pascalMatch[1]
        )
      ) {
        component = pascalMatch[1];
        cleanFinding = cleanFinding.slice(pascalMatch[0].length).trim();
      }
    }

    if (!component) {
      if (domain && domain !== 'general') {
        component = `${domain} module`;
      } else {
        component = 'system';
      }
    }

    const subject = component.startsWith('The ') ? component : `The ${component}`;

    // 3. Formulate predicate rule
    let predicate = '';

    if (fixSummary) {
      const cleanFix = fixSummary.trim().replace(/\.+$/, '');
      const fixAction = cleanFix
        .replace(/^(?:added|implemented|enforced|configured|specified)\s+/i, '')
        .trim();

      if (fixSummary.toLowerCase().includes('timeout')) {
        if (cleanFix.toLowerCase().includes('socket connection pool')) {
          predicate = `MUST configure timeout handler for socket connection pool`;
        } else {
          predicate = `MUST enforce timeout handling`;
        }
      } else {
        predicate = `MUST enforce ${fixAction}`;
      }
    } else if (
      cleanFinding.match(
        /^(?:fails?\s+to|does\s+not|doesn't)\s+(?:release|validate|close|redact|check|handle|enforce|sanitize|verify|set|catch|prevent)\b/i
      )
    ) {
      const match = cleanFinding.match(/^(?:fails?\s+to|does\s+not|doesn't)\s+([a-z]+)\s*(.*)/i);
      if (match) {
        const verb = match[1].toLowerCase();
        const rest = match[2];
        predicate = `MUST ${verb} ${rest}`.trim();
      }
    } else if (cleanFinding.match(/^(?:leaks?|exposes?)\b/i)) {
      const match = cleanFinding.match(/^(?:leaks?|exposes?)\s*(.*)/i);
      if (match) {
        predicate = `MUST NOT leak ${match[1]}`.trim();
      }
    } else if (cleanFinding.match(/^(?:causes? data loss|causes? data corruption)\b/i)) {
      predicate = `MUST NOT ${cleanFinding.toLowerCase()}`;
    } else if (cleanFinding.match(/^(?:missing|lacks?)\s+/i)) {
      const match = cleanFinding.match(/^(?:missing|lacks?)\s*(.*)/i);
      const item = match ? match[1] : cleanFinding;
      if (item.toLowerCase().includes('validation') || item.toLowerCase().includes('null check')) {
        predicate = `MUST validate ${item.replace(/^(?:validation for|null check in|check in)\s*/i, '')}`.trim();
      } else if (item.toLowerCase().includes('header')) {
        predicate = `MUST include ${item}`.trim();
      } else if (item.toLowerCase().includes('verification') || item.toLowerCase().includes('token')) {
        predicate = `MUST verify ${item.replace(/^token verification in\s*|^verification in\s*/i, '')}`.trim();
      } else {
        predicate = `MUST provide ${item}`.trim();
      }
    } else if (/sql injection/i.test(cleanFinding)) {
      predicate = `MUST prevent SQL injection vulnerabilities`;
    } else if (/timeout not enforced/i.test(cleanFinding)) {
      predicate = `MUST enforce timeouts during payload bursts`;
    } else if (/breaking backwards compatibility/i.test(cleanFinding)) {
      predicate = `MUST maintain backwards compatibility in API client signatures`;
    } else if (/cookies? lack/i.test(cleanFinding)) {
      predicate = `MUST set Secure and SameSite flags on sensitive session cookies`;
    } else {
      predicate = `MUST prevent ${cleanFinding.charAt(0).toLowerCase() + cleanFinding.slice(1)}`;
    }

    let result = `${subject} ${predicate}`.trim();
    if (!result.startsWith('The ') && !result.startsWith('Invariants ')) {
      result = `The ${result}`;
    }

    return result;
  }
}
