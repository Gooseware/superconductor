/**
 * attention-notifier.ts
 *
 * Sends desktop notifications ONLY for events that require human attention.
 * notify-send is called only from here — never from low-level guards or engines.
 *
 * Triggers:
 *   - verification_required: track paused, waiting for human approval
 *   - remediation_limit_exceeded: circuit breaker fired, needs human triage
 */
import { execFileSync } from 'child_process';

const MAX_BODY_LENGTH = 120;

/**
 * Sanitizes a string for use as a desktop notification body.
 * Strips characters that look alarming out of context.
 */
function sanitizeBody(raw: string): string {
  return raw.replace(/[$`();&|<>{}!]/g, '').substring(0, MAX_BODY_LENGTH);
}

/**
 * Sends a desktop notification if notify-send is available.
 * Silently no-ops if notify-send is not installed (CI environments).
 */
function sendNotification(title: string, body: string): void {
  try {
    execFileSync('notify-send', [title, sanitizeBody(body)], { stdio: 'ignore', timeout: 3000 });
  } catch {
    // notify-send not available (CI, headless server) — silently ignore
  }
}

/**
 * Notify user that a track is paused and waiting for their approval.
 * Called when orchestrator emits 'verification_required'.
 */
export function notifyVerificationRequired(trackId: string, spec: string): void {
  sendNotification(
    '🔔 Superconductor: Action Required',
    `Track ${trackId} is waiting for your approval: ${spec}`
  );
}

/**
 * Notify user that a track hit the remediation limit and needs triage.
 * Called when orchestrator emits 'remediation_limit_exceeded'.
 */
export function notifyRemediationLimitExceeded(trackId: string, iterations: number): void {
  sendNotification(
    '⚠️ Superconductor: Needs Triage',
    `Track ${trackId} hit remediation limit (${iterations} iterations). Human review needed.`
  );
}
