/**
 * Shared Tier 1 fenced block parser for code review manifests and findings.
 */

export function extractFencedBlock<T = any>(
  text: string,
  blockIdentifier: string
): T | null {
  if (!text || typeof text !== 'string') return null;
  if (!blockIdentifier || typeof blockIdentifier !== 'string') return null;

  const escaped = blockIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match ```json:<identifier> ... ``` or ```<identifier> ... ``` or ```json ... ``` (when blockIdentifier is 'json')
  const regex = new RegExp(
    `\`\`\`(?:json:)?${escaped}\\s*\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``,
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

      const sanitized: any[] = [];
      for (const item of parsed) {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          continue;
        }
        if (typeof item.severity === 'string') {
          item.severity = item.severity.toLowerCase().trim();
          if (!validSeverities.includes(item.severity)) item.severity = 'medium';
        }
        if (typeof item.category === 'string') {
          item.category = item.category.toLowerCase().trim();
          if (!validCategories.includes(item.category)) item.category = 'correctness';
        }
        sanitized.push(item);
      }
      return sanitized as T;
    }

    return parsed as T;
  } catch (err) {
    console.error(`[extractFencedBlock] Failed to parse JSON for block ${blockIdentifier}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}
