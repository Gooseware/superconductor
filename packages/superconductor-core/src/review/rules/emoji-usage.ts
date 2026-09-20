import { Finding, UxReviewInput, UxRule } from './types.js';

// Regular expression to match emojis (Unicode Extended_Pictographic)
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;
const GLOBAL_EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

export const emojiUsageRules: UxRule[] = [
  {
    id: 'UX-EMJ-01',
    name: 'Emoji Semantic Mapping Table Adherence',
    ruleGroup: 'Emoji Usage',
    severity: 'CRITICAL',
    description: 'Adhere strictly to canonical emoji semantics: ✅ for success, ❌ for failure, ⚠️ for warning, ⏳ for progress, ℹ️ for info.',
    heuristic: 'Never invert semantic emoji meanings (e.g. ❌ for success, ✅ for failure).',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      lines.forEach((line, idx) => {
        // Skip rule definition / tables
        if (line.includes('UX-EMJ-01') || line.includes('| Emoji |')) return;

        // Check for inverted semantics
        if (/❌\s+.*?\b(?:succeeded|success|passed|established|completed)\b/i.test(line)) {
          findings.push({
            id: 'UX-EMJ-01',
            severity: 'CRITICAL',
            ruleGroup: 'Emoji Usage',
            description: `Contradictory emoji semantics at line ${idx + 1}: ❌ used for success message.`,
            line: idx + 1,
            remediation: 'Use ✅ or ✔ for success and ❌ only for failure.'
          });
        }
        if (/✅\s+.*?\b(?:failed|failure|aborted|error)\b/i.test(line)) {
          findings.push({
            id: 'UX-EMJ-01',
            severity: 'CRITICAL',
            ruleGroup: 'Emoji Usage',
            description: `Contradictory emoji semantics at line ${idx + 1}: ✅ used for failure message.`,
            line: idx + 1,
            remediation: 'Use ❌ for failure and ✅ only for success.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-02',
    name: 'One Emoji Per Line Maximum',
    ruleGroup: 'Emoji Usage',
    severity: 'HIGH',
    description: 'Use at most one emoji per line to maintain visual clarity and professional tone.',
    heuristic: 'Restrict lines to a single icon or emoji.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      let inCodeBlock = false;

      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (inCodeBlock) return;

        // Skip markdown tables or emoji reference docs
        if (line.startsWith('|') || line.trim().startsWith('|') || line.includes('Semantic Mapping')) return;

        const matches = line.match(GLOBAL_EMOJI_REGEX);
        if (matches && matches.length > 1) {
          findings.push({
            id: 'UX-EMJ-02',
            severity: 'HIGH',
            ruleGroup: 'Emoji Usage',
            description: `Line ${idx + 1} contains ${matches.length} emojis; maximum allowed is 1.`,
            line: idx + 1,
            remediation: 'Limit to at most one emoji per line at the beginning of the line.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-03',
    name: 'Emoji Prefix Position Only',
    ruleGroup: 'Emoji Usage',
    severity: 'HIGH',
    description: 'Emojis must be placed at the start of the line or list item, not buried in the middle or end.',
    heuristic: 'Always position emojis at the start of a line or bullet item.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      let inCodeBlock = false;

      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          return;
        }
        if (inCodeBlock) return;

        // Skip tables, rule descriptions, code blocks
        if (
          line.startsWith('|') ||
          line.trim().startsWith('|') ||
          line.trim().startsWith('`') ||
          line.includes('UX-EMJ') ||
          input.filePath?.endsWith('processor-heuristics.md') ||
          input.content.includes('# Processor Heuristics')
        ) return;

        const trimmed = line.trim();
        // Remove markdown list prefix, blockquote, or quotes if any
        const withoutBullet = trimmed.replace(/^(?:[-*]|\d+\.|>)\s*["']?/, '');
        // Strip inline code literals (e.g. `✖`)
        const withoutCode = withoutBullet.replace(/`[^`]*`/g, '');
        
        // Check if line contains emoji but does NOT start with emoji
        const firstMatch = withoutCode.match(EMOJI_REGEX);
        if (firstMatch && firstMatch.index !== undefined && firstMatch.index > 0) {
          findings.push({
            id: 'UX-EMJ-03',
            severity: 'HIGH',
            ruleGroup: 'Emoji Usage',
            description: `Emoji placed in middle or end of sentence at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Move emoji to the very beginning of the line or bullet item.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-04',
    name: 'Space After Emoji',
    ruleGroup: 'Emoji Usage',
    severity: 'ADVISORY',
    description: 'Leave exactly one space after an emoji.',
    heuristic: 'Always follow an emoji with a single space before text.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const missingSpaceRegex = /(?:✅|❌|⚠️|⏳|ℹ️|🔍|📓)[^\s\n]/;

      lines.forEach((line, idx) => {
        if (line.includes('UX-EMJ-04') || line.includes('|')) return;
        if (missingSpaceRegex.test(line)) {
          findings.push({
            id: 'UX-EMJ-04',
            severity: 'ADVISORY',
            ruleGroup: 'Emoji Usage',
            description: `Missing space after emoji at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Insert a space immediately after the emoji (e.g. "✅ Starting").'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-05',
    name: 'No Inline Word Replacement',
    ruleGroup: 'Emoji Usage',
    severity: 'CRITICAL',
    description: 'Do not replace words with emojis inline in sentences (e.g. "Use this 🔑 to login").',
    heuristic: 'Never use emojis as word substitutes in prose sentences.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const wordReplacementRegex = /\b(?:the|a|an|this|your)\s+(?:🔑|🐛|🔥|🚀|💡|🎉|📦)\s+[a-z]+/i;

      lines.forEach((line, idx) => {
        if (wordReplacementRegex.test(line)) {
          findings.push({
            id: 'UX-EMJ-05',
            severity: 'CRITICAL',
            ruleGroup: 'Emoji Usage',
            description: `Inline emoji word replacement detected at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Replace emoji with proper text noun/verb; do not replace words with emojis.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-06',
    name: 'Standard Canonical Emojis Only',
    ruleGroup: 'Emoji Usage',
    severity: 'HIGH',
    description: 'Restrict emojis to the canonical set (✅, ❌, ⚠️, ⏳, ℹ️, 🔍, 📓, ✔, ✖); avoid decorative emojis.',
    heuristic: 'Avoid novelty, decorative emojis (🦄, 🍕, 🚀) in technical CLI and documentation.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const nonStandardEmojiRegex = /[🦄🍕🎉🚀🔥💩]/u;

      lines.forEach((line, idx) => {
        if (line.includes('UX-EMJ-06') || line.includes('heuristic')) return;
        if (nonStandardEmojiRegex.test(line)) {
          findings.push({
            id: 'UX-EMJ-06',
            severity: 'HIGH',
            ruleGroup: 'Emoji Usage',
            description: `Non-canonical decorative emoji found at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Use only standard semantic emojis (✅, ❌, ⚠️, ⏳, ℹ️, 🔍, 📓).'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-EMJ-07',
    name: 'Neutral Info Emoji Semantics',
    ruleGroup: 'Emoji Usage',
    severity: 'HIGH',
    description: 'Use ℹ / ℹ️ exclusively for neutral, informational messages (not errors or warnings).',
    heuristic: 'Reserve ℹ️ strictly for neutral context and informational notes.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      lines.forEach((line, idx) => {
        if (line.includes('UX-EMJ-07')) return;
        if (/(?:ℹ|ℹ️)\s+.*?\b(?:critical|fatal|error|warning|aborted)\b/i.test(line)) {
          findings.push({
            id: 'UX-EMJ-07',
            severity: 'HIGH',
            ruleGroup: 'Emoji Usage',
            description: `Info emoji (ℹ️) incorrectly used for warning/error message at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Use ⚠️ for warnings and ❌ for errors; reserve ℹ️ for neutral information.'
          });
        }
      });
      return findings;
    }
  }
];
