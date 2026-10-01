import {
  ParsedTaskCard,
  ParsedTaskCardSchema,
} from './task-schema.js';

/**
 * Sanitize an extracted list item:
 * - Trims whitespace
 * - Strips inline comments (# ...)
 * - Strips wrapping quotes ("...", '...') or backticks (`...`)
 * - Strips wrapping brackets if singular ([...])
 */
function sanitizeItem(raw: string): string {
  let cleaned = raw.trim();
  // Strip trailing comments (e.g. # comment)
  cleaned = cleaned.replace(/\s+#.*$/, '').trim();

  // Strip wrapping outer brackets if present on single item
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Strip wrapping quotes or backticks
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('`') && cleaned.endsWith('`'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

/**
 * Extracts a list of strings from a metadata field in a task block.
 * Supports:
 * - Single-line comma-separated: `REUSES: card.tsx, auth-sso`
 * - Single-line bracketed: `REUSES: [card.tsx, auth-sso]`
 * - Single-line empty: `REUSES: []`, `REUSES: [ ]`, `REUSES: none`, `REUSES:`
 * - Multi-line bullet list:
 *     REUSES:
 *       - card.tsx
 *       - auth-sso
 */
export function extractListField(block: string, fieldName: string): string[] {
  const lines = block.split('\n');
  const fieldRegex = new RegExp(`^\\s*${fieldName}:\\s*(.*)$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fieldRegex);
    if (!match) continue;

    const rawRest = match[1].trim();
    const restOfLine = rawRest.replace(/\s+#.*$/, '').trim();

    // Check if content exists on the same line
    if (restOfLine.length > 0) {
      if (
        restOfLine === '[]' ||
        restOfLine === '[ ]' ||
        restOfLine.toLowerCase() === 'none' ||
        restOfLine.toLowerCase() === 'n/a'
      ) {
        return [];
      }

      let content = restOfLine;
      if (content.startsWith('[') && content.endsWith(']')) {
        content = content.slice(1, -1).trim();
      }
      if (!content) return [];

      return content
        .split(',')
        .map(item => sanitizeItem(item))
        .filter(item => item.length > 0);
    }

    // If restOfLine is empty, look for multi-line bullet points in subsequent lines
    const items: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j];

      // Ignore empty or whitespace-only lines
      if (!nextLine.trim()) {
        continue;
      }

      // If nextLine is another tag (e.g. CREATES:, INVARIANT_AFTER:), subtask, or section heading, stop
      if (
        /^\s*[A-Z_]+:\s*/i.test(nextLine) ||
        /^\s*-\s*\[[ xX]\]/i.test(nextLine) ||
        /^##/i.test(nextLine)
      ) {
        break;
      }

      // Check if bullet item: "- item" or "* item"
      const bulletMatch = nextLine.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        const item = sanitizeItem(bulletMatch[1]);
        if (item) {
          items.push(item);
        }
      } else {
        // Line has content but is not a bullet item -> end of list
        break;
      }
    }
    return items;
  }

  return [];
}

/**
 * Extracts a string value from a metadata field in a task block.
 * Strips wrapping quotes if present.
 */
export function extractStringField(block: string, fieldName: string): string | undefined {
  const lines = block.split('\n');
  const fieldRegex = new RegExp(`^\\s*${fieldName}:\\s*(.*)$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fieldRegex);
    if (!match) continue;

    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('`') && value.endsWith('`'))
    ) {
      value = value.slice(1, -1).trim();
    }
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

export interface ParseTaskCardOptions {
  defaultPhase?: number;
  id?: string;
}

/**
 * Parse a single task card block into a structured, validated ParsedTaskCard.
 *
 * @param taskBlock - The markdown block containing the task declaration and metadata.
 * @param optionsOrPhase - Optional configuration options or default phase number.
 */
export function parseTaskCard(
  taskBlock: string,
  optionsOrPhase?: ParseTaskCardOptions | number
): ParsedTaskCard {
  const options: ParseTaskCardOptions =
    typeof optionsOrPhase === 'number'
      ? { defaultPhase: optionsOrPhase }
      : optionsOrPhase ?? {};

  // Check for phase header within taskBlock if present
  let phase = options.defaultPhase ?? 0;
  const phaseMatch = taskBlock.match(/^##\s+Phase\s+(\d+)/im);
  if (phaseMatch) {
    phase = parseInt(phaseMatch[1], 10);
  }

  // Find the primary task declaration line
  const headerMatch = taskBlock.match(/^\s*(?:-\s*\[([ xX])\]\s*)?[Tt]ask:\s*(.+)$/m);
  if (!headerMatch) {
    throw new Error('Invalid task card: Missing "Task:" declaration.');
  }

  const completed = headerMatch[1] ? headerMatch[1].toLowerCase() === 'x' : false;
  const fullHeader = headerMatch[2].trim();

  // Extract Tier [TIER-N] or [TIER-N:TCS=M]
  const tierMatch = fullHeader.match(/\[TIER-(\d+)(?::[^\]]+)?\]/i);
  const tier = tierMatch ? parseInt(tierMatch[1], 10) : 1;

  // Extract Agent [AGENT:name]
  const agentMatch = fullHeader.match(/\[AGENT:([^\]]+)\]/i);
  const agent = agentMatch ? agentMatch[1].trim() : 'superconductor-processor';

  // Extract Domain [DOMAIN:name]
  const domainMatch = fullHeader.match(/\[DOMAIN:([^\]]+)\]/i);
  const domain = domainMatch ? domainMatch[1].trim() : 'default';

  // Extract clean Task Title by removing tag annotations
  const task = fullHeader
    .replace(/\[TIER-\d+(?::[^\]]+)?\]/gi, '')
    .replace(/\[AGENT:[^\]]+\]/gi, '')
    .replace(/\[DOMAIN:[^\]]+\]/gi, '')
    .trim();

  // Extract list and string metadata fields
  const creates = extractListField(taskBlock, 'CREATES');
  const protectedFiles = extractListField(taskBlock, 'PROTECTED');
  const reuses = extractListField(taskBlock, 'REUSES');
  const invariantAfter = extractStringField(taskBlock, 'INVARIANT_AFTER');

  // Extract subtasks: lines matching - [ ] ... or - [x] ... after the primary header
  const subtasks: string[] = [];
  const lines = taskBlock.split('\n');
  for (const line of lines) {
    const subtaskMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (subtaskMatch) {
      if (/^\s*-\s*\[[ xX]\]\s*[Tt]ask:\s*/i.test(line)) {
        continue;
      }
      subtasks.push(subtaskMatch[2].trim());
    }
  }

  const card: ParsedTaskCard = {
    id: options.id,
    task,
    tier,
    agent,
    domain,
    phase,
    creates,
    protected: protectedFiles,
    invariantAfter,
    reuses,
    completed,
    subtasks,
    raw: taskBlock.trim(),
  };

  return ParsedTaskCardSchema.parse(card);
}

/**
 * Parse an entire plan.md markdown document and extract all task cards
 * with full metadata (including CREATES, PROTECTED, INVARIANT_AFTER, and REUSES).
 *
 * @param planMarkdown - The full markdown text of a plan.md file.
 * @returns Array of ParsedTaskCard objects in document order.
 */
export function parsePlanTasksWithMetadata(planMarkdown: string): ParsedTaskCard[] {
  const cards: ParsedTaskCard[] = [];
  let currentPhase = 0;
  let currentTaskLines: string[] = [];
  let taskIndex = 0;

  function flushCurrentTask() {
    if (currentTaskLines.length > 0) {
      const cardBlock = currentTaskLines.join('\n');
      const card = parseTaskCard(cardBlock, {
        defaultPhase: currentPhase,
        id: `task-${taskIndex++}`,
      });
      cards.push(card);
      currentTaskLines = [];
    }
  }

  const lines = planMarkdown.split('\n');

  for (const line of lines) {
    // Detect phase headers: ## Phase N ...
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)/i);
    if (phaseMatch) {
      flushCurrentTask();
      currentPhase = parseInt(phaseMatch[1], 10);
      continue;
    }

    // Detect task card start: - [ ] Task: ... or - [x] Task: ...
    const isTaskStart = /^\s*-\s*\[[ xX]\]\s*[Tt]ask:\s*.+/i.test(line);
    if (isTaskStart) {
      flushCurrentTask();
      currentTaskLines.push(line);
      continue;
    }

    // Inside a task block
    if (currentTaskLines.length > 0) {
      // Check if we hit another major section boundary
      if (/^##\s+/i.test(line) || /^---\s*$/.test(line)) {
        flushCurrentTask();
        continue;
      }
      currentTaskLines.push(line);
    }
  }

  flushCurrentTask();
  return cards;
}
