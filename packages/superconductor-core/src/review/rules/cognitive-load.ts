import { Finding, UxReviewInput, UxRule } from './types.js';

export const cognitiveLoadRules: UxRule[] = [
  {
    id: 'UX-COG-01',
    name: 'No Wall Of Text',
    ruleGroup: 'Cognitive Load',
    severity: 'CRITICAL',
    description: 'Avoid walls of text; break up paragraphs longer than 6 lines.',
    heuristic: 'Break prose into digestible paragraphs or bullet points; max 6 lines per block.',
    evaluate: (input: UxReviewInput): Finding[] => {
      if (input.targetType === 'mcp_schema' || input.filePath?.endsWith('.json')) {
        return [];
      }
      const trimmedContent = input.content.trim();
      if (trimmedContent.startsWith('{')) {
        try {
          JSON.parse(trimmedContent);
          return [];
        } catch {
          // not valid JSON, proceed with normal evaluation
        }
      }

      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      let denseCount = 0;
      let startLine = 1;

      let inCodeBlock = false;
      lines.forEach((line, idx) => {
        if (line.trim().startsWith('```')) {
          inCodeBlock = !inCodeBlock;
          denseCount = 0;
          return;
        }
        if (inCodeBlock) return;

        // Count non-empty lines that are not headings, list items, or tables
        const trimmed = line.trim();
        const isStructural = trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed) || trimmed.startsWith('|') || trimmed.startsWith('>');

        if (!isStructural) {
          if (denseCount === 0) startLine = idx + 1;
          denseCount++;
          if (denseCount > 6) {
            findings.push({
              id: 'UX-COG-01',
              severity: 'CRITICAL',
              ruleGroup: 'Cognitive Load',
              description: `Wall of text detected (${denseCount} continuous lines) starting at line ${startLine}.`,
              line: startLine,
              remediation: 'Break long paragraphs into smaller paragraphs or bullet points.'
            });
            denseCount = 0;
          }
        } else {
          denseCount = 0;
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-COG-02',
    name: 'Max Options Constraint',
    ruleGroup: 'Cognitive Load',
    severity: 'HIGH',
    description: 'Expose a maximum of 3 primary options to the user at a time.',
    heuristic: 'Limit interactive menus to at most 3 primary choices with an advanced sub-menu.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // Look for interactive menu options with more than 3 choices
      const menuPattern = /(?:select|choose|options):\s*\n(?:\s*\[?[1-9]\]?[^ \n].*\n){4,}/i;
      const match = menuPattern.exec(input.content);
      if (match) {
        findings.push({
          id: 'UX-COG-02',
          severity: 'HIGH',
          ruleGroup: 'Cognitive Load',
          description: 'Prompt presents more than 3 primary choices to the user.',
          line: 1,
          remediation: 'Expose maximum 3 primary choices; tuck secondary options under "Advanced".'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-COG-03',
    name: 'Explicit Escape Hatch',
    ruleGroup: 'Cognitive Load',
    severity: 'HIGH',
    description: 'Provide an explicit escape hatch for interactive operations (e.g. Ctrl+C or ESC).',
    heuristic: 'Always inform users how to cancel or exit an interactive prompt or session.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType === 'cli_output' && input.content.includes('? [') && !/ctrl\+c|esc|cancel/i.test(input.content)) {
        findings.push({
          id: 'UX-COG-03',
          severity: 'HIGH',
          ruleGroup: 'Cognitive Load',
          description: 'Interactive prompt lacks an explicit cancellation escape hatch.',
          line: 1,
          remediation: 'Display explicit cancellation key (e.g., "(Press Ctrl+C to cancel)").'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-COG-04',
    name: 'Elapsed Time Display',
    ruleGroup: 'Cognitive Load',
    severity: 'ADVISORY',
    description: 'Display elapsed duration upon completion of long-running operations.',
    heuristic: 'Report elapsed execution time for multi-step or asynchronous tasks.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      if (input.targetType === 'cli_output' && input.content.includes('Finished batch') && !/\b\d+(?:\.\d+)?(?:s|ms|m)\b/.test(input.content)) {
        findings.push({
          id: 'UX-COG-04',
          severity: 'ADVISORY',
          ruleGroup: 'Cognitive Load',
          description: 'Completed batch operation does not display elapsed time.',
          line: 1,
          remediation: 'Report execution duration in seconds or minutes (e.g., "in 4.2s").'
        });
      }
      return findings;
    }
  },
  {
    id: 'UX-COG-05',
    name: '3-Tier Output Compliance',
    ruleGroup: 'Cognitive Load',
    severity: 'HIGH',
    description: 'Maintain strict separation between TOOL_HOME, PROJECT_ROOT, and INTELLIGENCE_DIR.',
    heuristic: 'Never interchange global tool cache (~/.superconductor) with project intelligence directory.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');

      // Detect pointing intelligence snapshot resolution to getSuperconductorHome() or ~/.superconductor
      const snapshotConfusionRegex = /(?:outputDir|OUTPUT_DIR|snapshotPath)\s*=\s*(?:getSuperconductorHome\(\)|['"]~?\/\.superconductor)/;

      lines.forEach((line, idx) => {
        if (snapshotConfusionRegex.test(line)) {
          findings.push({
            id: 'UX-COG-05',
            severity: 'HIGH',
            ruleGroup: 'Cognitive Load',
            description: `Violation of 3-tier directory contract at line ${idx + 1}: snapshot path routed to tool cache.`,
            line: idx + 1,
            remediation: 'Route snapshots to INTELLIGENCE_DIR ($PROJECT_ROOT/superconductor/intelligence), not TOOL_HOME.'
          });
        }
      });
      return findings;
    }
  },
  {
    id: 'UX-COG-06',
    name: 'Summary-First Reporting',
    ruleGroup: 'Cognitive Load',
    severity: 'CRITICAL',
    description: 'Reports and review briefings must state the verdict/summary at the top.',
    heuristic: 'Lead with the verdict or high-level summary before detailing findings.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      // If content looks like a report/review with findings, check if verdict/summary is at the top
      if (input.content.includes('## Findings') || input.content.includes('### Findings') || input.content.includes('Deduplicated Findings')) {
        const lines = input.content.split('\n');
        const first5Lines = lines.slice(0, 10).join('\n');
        const hasTopVerdict = /\b(?:Verdict|Summary|Status|Report Summary):\s*(?:PASS|NEEDS_FIXES|FAILED|RESOLVED)/i.test(first5Lines) ||
                              /# Arbiter Briefing|# UX Review Report|# Review Report/i.test(first5Lines);
        if (!hasTopVerdict) {
          findings.push({
            id: 'UX-COG-06',
            severity: 'CRITICAL',
            ruleGroup: 'Cognitive Load',
            description: 'Report does not present the summary or verdict in the opening section.',
            line: 1,
            remediation: 'Place the verdict and executive summary at the very beginning of the report.'
          });
        }
      }
      return findings;
    }
  },
  {
    id: 'UX-COG-07',
    name: 'Human-Readable Byte Sizes',
    ruleGroup: 'Cognitive Load',
    severity: 'HIGH',
    description: 'Display byte sizes in human-readable units (e.g. 1.2 MB instead of 1258291 bytes).',
    heuristic: 'Always format sizes > 1024 bytes with KB, MB, or GB suffixes.',
    evaluate: (input: UxReviewInput): Finding[] => {
      const findings: Finding[] = [];
      const lines = input.content.split('\n');
      const rawBytesRegex = /\b(\d{6,})\s*(?:bytes|B)\b/i;

      lines.forEach((line, idx) => {
        // Skip lockfiles, hashes, or schema definitions
        if (line.includes('sha256') || line.includes('integrity') || line.includes('pnpm-lock')) return;
        const match = rawBytesRegex.exec(line);
        if (match) {
          findings.push({
            id: 'UX-COG-07',
            severity: 'HIGH',
            ruleGroup: 'Cognitive Load',
            description: `Raw unformatted byte count "${match[0]}" at line ${idx + 1}.`,
            line: idx + 1,
            remediation: 'Convert large byte numbers to human-readable format (e.g., 1.2 MB).'
          });
        }
      });
      return findings;
    }
  }
];
