/**
 * Shared Tier 1 fenced block parser for code review manifests and findings.
 */

export function extractFencedBlock<T = any>(
  text: string,
  blockIdentifier: string
): T | null {
  if (!text) return null;

  // Match ```json:<identifier> ... ``` or ```<identifier> ... ```
  const regex = new RegExp(
    `\`\`\`(?:json:)?${blockIdentifier}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    'i'
  );
  const match = text.match(regex);

  if (!match || !match[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1].trim());

    // Basic schema normalization & validation for known block identifiers
    if (blockIdentifier === 'coverage-manifest') {
      if (typeof parsed !== 'object' || parsed === null) return null;
      parsed.examined = Array.isArray(parsed.examined) ? parsed.examined : [];
      parsed.skimmed = Array.isArray(parsed.skimmed) ? parsed.skimmed : [];
      parsed.not_examined = Array.isArray(parsed.not_examined) ? parsed.not_examined : [];
    } else if (blockIdentifier === 'review-findings') {
      if (!Array.isArray(parsed)) return null;
      const validSeverities = ['critical', 'high', 'medium', 'low', 'advisory'];
      const validCategories = ['security', 'correctness', 'adversarial', 'architecture', 'style'];

      for (const finding of parsed) {
        if (typeof finding.severity === 'string') {
          finding.severity = finding.severity.toLowerCase();
          if (!validSeverities.includes(finding.severity)) finding.severity = 'medium';
        }
        if (typeof finding.category === 'string') {
          finding.category = finding.category.toLowerCase();
          if (!validCategories.includes(finding.category)) finding.category = 'correctness';
        }
      }
    }

    return parsed as T;
  } catch (err) {
    console.error(`[extractFencedBlock] Failed to parse JSON for block ${blockIdentifier}:`, err);
    return null;
  }
}
