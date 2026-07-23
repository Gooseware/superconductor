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
    return JSON.parse(match[1].trim()) as T;
  } catch (err) {
    console.error(`[extractFencedBlock] Failed to parse JSON for block ${blockIdentifier}:`, err);
    return null;
  }
}
