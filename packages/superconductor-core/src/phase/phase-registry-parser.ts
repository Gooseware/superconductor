import {
  type RegistryManifest,
  type PhaseItem,
  type PhaseTrackItem,
  type PhaseStatus,
  type AbsorbedTrackItem,
  validatePhaseId,
} from './phase-manifest.js';

/**
 * Strips markdown formatting (backticks, bold, italic, list markers) from text.
 */
export function cleanMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](link) -> text
    .replace(/`([^`]+)`/g, '$1')             // `code` -> code
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1')           // *italic* -> italic
    .replace(/^[-*+]\s*/, '')                // list prefix
    .trim();
}

/**
 * Extracts URL from markdown link syntax [text](url) or returns cleaned text.
 */
export function extractUrl(text: string): string {
  if (!text) return '';
  const match = text.match(/\[[^\]]*\]\(([^)]+)\)/);
  if (match) return match[1].trim();
  return text.replace(/^[`\s]+|[`\s]+$/g, '').trim();
}

/**
 * Generates a valid symbolic phase ID from a human-readable phase name.
 */
export function slugifyPhaseId(name: string): string {
  if (!name) return 'default';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'phase';
}

function normalizePhaseStatus(raw?: string): PhaseStatus {
  if (!raw) return 'planned';
  const s = raw.trim().toLowerCase();
  if (s === 'active' || s === 'in_progress' || s === 'in progress') return 'active';
  if (s === 'completed' || s === 'complete' || s === 'done') return 'completed';
  if (s === 'blocked') return 'blocked';
  return 'planned';
}

function normalizeTrackStatus(raw?: string): 'completed' | 'in_progress' | 'planned' {
  if (!raw) return 'planned';
  const s = cleanMarkdown(raw).toLowerCase().replace(/[\[\]]/g, '').trim();
  if (s === 'x' || s === 'completed' || s === 'complete' || s === 'done') return 'completed';
  if (s === '~' || s === 'in_progress' || s === 'in progress') return 'in_progress';
  return 'planned';
}

interface RawSection {
  type: 'phase' | 'legacy_active' | 'absorbed' | 'archived' | 'other';
  headerText: string;
  phaseMeta?: {
    ordinal?: number;
    phaseId: string;
    name: string;
    status: PhaseStatus;
  };
  lines: string[];
}

export class PhaseRegistryParser {
  /**
   * Parses markdown tracks registry content into a strongly typed RegistryManifest.
   */
  public static parse(markdown: string): RegistryManifest {
    if (!markdown || !markdown.trim()) {
      return { phases: [] };
    }

    const lines = markdown.split('\n');
    const sections: RawSection[] = [];
    let currentSection: RawSection = {
      type: 'other',
      headerText: '',
      lines: [],
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for level 2 (or 3) headings
      const headingMatch = trimmed.match(/^#{2,3}\s+(.+)$/);
      if (headingMatch) {
        // Push previous section if it had content
        if (currentSection.lines.length > 0 || currentSection.type !== 'other') {
          sections.push(currentSection);
        }

        const headerContent = headingMatch[1].trim();

        // 1. Phase Heading
        // Patterns:
        // ## Phase <N>: <Name> (<Status>)
        // ## Phase [<id>]: <Name> (<Status>)
        // ## Phase <N> [<id>]: <Name> (<Status>)
        // ## Phase <N>: <Name>
        const phaseHeadingMatch = headerContent.match(
          /^Phase(?:\s+(\d+))?(?:\s*\[([a-z0-9_-]+)\])?(?::\s*|\s+-\s*|\s+)(.+?)(?:\s*\(([^)]+)\))?$/i
        );

        if (phaseHeadingMatch) {
          const rawOrdinal = phaseHeadingMatch[1];
          const rawPhaseId = phaseHeadingMatch[2];
          const rawName = phaseHeadingMatch[3]?.trim();
          const rawStatus = phaseHeadingMatch[4];

          const ordinal = rawOrdinal ? parseInt(rawOrdinal, 10) : undefined;
          const name = cleanMarkdown(rawName || 'Unnamed Phase');
          let phaseId = rawPhaseId ? rawPhaseId.toLowerCase() : slugifyPhaseId(name);

          // Validate phase ID security constraint; fall back to safe slug if needed
          const idValidation = validatePhaseId(phaseId);
          if (!idValidation.valid) {
            phaseId = `phase-${ordinal ?? sections.length + 1}`;
          }

          const status = normalizePhaseStatus(rawStatus);

          currentSection = {
            type: 'phase',
            headerText: headerContent,
            phaseMeta: {
              ordinal,
              phaseId,
              name,
              status,
            },
            lines: [],
          };
          continue;
        }

        // 2. Absorbed Tracks Heading
        if (/^(?:absorbed|closed)(?:\s*\/\s*(?:closed|absorbed))?\s*tracks/i.test(headerContent)) {
          currentSection = {
            type: 'absorbed',
            headerText: headerContent,
            lines: [],
          };
          continue;
        }

        // 3. Archived Tracks Heading
        if (/^archived\s*tracks/i.test(headerContent)) {
          currentSection = {
            type: 'archived',
            headerText: headerContent,
            lines: [],
          };
          continue;
        }

        // 4. Status Key (skip / other)
        if (/^status\s*key/i.test(headerContent)) {
          currentSection = {
            type: 'other',
            headerText: headerContent,
            lines: [],
          };
          continue;
        }

        // 5. Active Tracks (Legacy unsectioned active tracks)
        if (/^active\s*tracks/i.test(headerContent)) {
          currentSection = {
            type: 'legacy_active',
            headerText: headerContent,
            lines: [],
          };
          continue;
        }

        // Other generic heading
        currentSection = {
          type: 'other',
          headerText: headerContent,
          lines: [],
        };
        continue;
      }

      currentSection.lines.push(line);
    }

    // Push the final section
    if (currentSection.lines.length > 0 || currentSection.type !== 'other') {
      sections.push(currentSection);
    }

    const phases: PhaseItem[] = [];
    let absorbed: AbsorbedTrackItem[] | undefined;
    let archived: string[] | undefined;
    const legacyTracks: PhaseTrackItem[] = [];

    const hasExplicitPhases = sections.some((s) => s.type === 'phase');

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const sec = sections[sIdx];

      if (sec.type === 'phase' && sec.phaseMeta) {
        const tracks = this.extractTracksFromLines(sec.lines);
        phases.push({
          phaseId: sec.phaseMeta.phaseId,
          name: sec.phaseMeta.name,
          status: sec.phaseMeta.status,
          ordinal: sec.phaseMeta.status === 'completed' ? undefined : (sec.phaseMeta.ordinal ?? phases.length + 1),
          tracks,
        });
      } else if (sec.type === 'absorbed') {
        const absorbedTracks = this.extractAbsorbedFromLines(sec.lines);
        if (absorbedTracks.length > 0) {
          absorbed = (absorbed || []).concat(absorbedTracks);
        }
      } else if (sec.type === 'archived') {
        const archivedTracks = this.extractArchivedFromLines(sec.lines);
        if (archivedTracks.length > 0) {
          archived = (archived || []).concat(archivedTracks);
        }
      } else if (sec.type === 'legacy_active' || (!hasExplicitPhases && sec.type === 'other')) {
        const tracks = this.extractTracksFromLines(sec.lines);
        if (tracks.length > 0) {
          legacyTracks.push(...tracks);
        }
      }
    }

    // Backward compatibility: If no explicit Phase headings exist, but tracks were found,
    // wrap them into default virtual phase:
    // { phaseId: 'default', name: 'Active Tracks', status: 'active', ordinal: 1, tracks: [...] }
    if (!hasExplicitPhases && legacyTracks.length > 0) {
      phases.push({
        phaseId: 'default',
        name: 'Active Tracks',
        status: 'active',
        ordinal: 1,
        tracks: legacyTracks,
      });
    }

    return {
      phases,
      ...(absorbed && absorbed.length > 0 ? { absorbed } : {}),
      ...(archived && archived.length > 0 ? { archived } : {}),
    };
  }

  /**
   * Serializes a RegistryManifest back into clean, aligned GitHub-Flavored Markdown.
   */
  public static serialize(manifest: RegistryManifest): string {
    const lines: string[] = ['# Tracks Registry', ''];

    for (let i = 0; i < manifest.phases.length; i++) {
      const phase = manifest.phases[i];
      const ordinalStr = phase.ordinal !== undefined ? ` ${phase.ordinal}` : (phase.status === 'completed' ? '' : ` ${i + 1}`);
      const statusLabel = phase.status.charAt(0).toUpperCase() + phase.status.slice(1);

      if (phase.phaseId === 'default' && phase.name.toLowerCase() === 'active tracks') {
        lines.push('## Active Tracks', '');
      } else {
        const defaultSlug = slugifyPhaseId(phase.name);
        const idTag = phase.phaseId !== defaultSlug && phase.phaseId !== 'default' ? ` [${phase.phaseId}]` : '';
        lines.push(`## Phase${ordinalStr}${idTag}: ${phase.name} (${statusLabel})`, '');
      }

      if (phase.tracks.length > 0) {
        const hasNotes = phase.tracks.some((t) => !!t.note);
        const headers = hasNotes
          ? ['Status', 'Track ID', 'Title', 'Branch', 'Note']
          : ['Status', 'Track ID', 'Title', 'Branch'];

        const rows: string[][] = phase.tracks.map((t) => {
          let statusGlyph = '`[ ]`';
          if (t.status === 'completed') statusGlyph = '`[x]`';
          else if (t.status === 'in_progress') statusGlyph = '`[~]`';

          const trackIdFormatted = `\`${t.trackId}\``;
          const titleFormatted = t.link ? `[${t.title}](${t.link})` : t.title;

          let branchFormatted = '-';
          if (t.branch) {
            branchFormatted = t.branch.includes('`') ? t.branch : `\`${t.branch}\``;
          }

          if (hasNotes) {
            return [statusGlyph, trackIdFormatted, titleFormatted, branchFormatted, t.note || '-'];
          }
          return [statusGlyph, trackIdFormatted, titleFormatted, branchFormatted];
        });

        lines.push(...this.formatAlignedTable(headers, rows), '');
      }
    }

    if (manifest.absorbed && manifest.absorbed.length > 0) {
      lines.push('## Absorbed / Closed Tracks', '');
      const headers = ['Track ID', 'Absorbed By', 'Reason'];
      const rows = manifest.absorbed.map((a) => [
        `\`${a.trackId}\``,
        `\`${a.absorbedBy}\``,
        a.reason,
      ]);
      lines.push(...this.formatAlignedTable(headers, rows), '');
    }

    if (manifest.archived && manifest.archived.length > 0) {
      lines.push('## Archived Tracks (Completed)', '');
      lines.push('See `superconductor/tracks/archive/` for the following completed tracks:');
      for (const trackId of manifest.archived) {
        lines.push(`- \`${trackId}\``);
      }
      lines.push('');
    }

    lines.push('---', '', '## Status Key');
    lines.push('- `[ ]` — Planned / not started');
    lines.push('- `[~]` — In progress');
    lines.push('- `[x]` — Complete');
    lines.push('- `[-]` — Cancelled / absorbed');
    lines.push('');

    return lines.join('\n');
  }

  private static extractTracksFromLines(lines: string[]): PhaseTrackItem[] {
    const tracks: PhaseTrackItem[] = [];

    // 1. Check for markdown tables
    const tableBlocks = this.findTableBlocks(lines);
    for (const tableRows of tableBlocks) {
      if (tableRows.length < 2) continue;

      const headerCells = this.splitTableRow(tableRows[0]).map((c) => c.toLowerCase().trim());
      const getColIndex = (patterns: RegExp[]): number =>
        headerCells.findIndex((h) => patterns.some((p) => p.test(h)));

      const statusIdx = getColIndex([/^(status|state)$/i]);
      const idIdx = getColIndex([/^(id|track[\s_-]?id)$/i]);
      const titleIdx = getColIndex([/^(title|name|track[\s_-]?name)$/i]);
      const fallbackTitleIdx = titleIdx === -1 ? getColIndex([/^track$/i]) : titleIdx;
      const branchIdx = getColIndex([/^(branch)$/i]);
      const linkIdx = getColIndex([/^(link|path|url)$/i]);
      const noteIdx = getColIndex([/^(note|notes|description|desc)$/i]);

      // If neither status, id, nor title is found, this is not a track table
      if (statusIdx === -1 && idIdx === -1 && fallbackTitleIdx === -1) continue;

      // Parse data rows (skip header [0] and divider [1])
      for (let r = 2; r < tableRows.length; r++) {
        const cells = this.splitTableRow(tableRows[r]);
        if (cells.length === 0) continue;

        const rawStatus = statusIdx >= 0 ? cells[statusIdx] : '';
        const rawId = idIdx >= 0 ? cells[idIdx] : '';
        const rawTitle = fallbackTitleIdx >= 0 ? cells[fallbackTitleIdx] : '';
        const rawBranch = branchIdx >= 0 ? cells[branchIdx] : '';
        const rawLink = linkIdx >= 0 ? cells[linkIdx] : '';
        const rawNote = noteIdx >= 0 ? cells[noteIdx] : '';

        // Extract link from title if markdown link
        let title = cleanMarkdown(rawTitle);
        let link = rawLink ? extractUrl(rawLink) : undefined;
        const linkInTitleMatch = rawTitle.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkInTitleMatch) {
          title = cleanMarkdown(linkInTitleMatch[1]);
          if (!link) link = linkInTitleMatch[2].trim();
        }

        let trackId = cleanMarkdown(rawId);
        if (!trackId && link) {
          const match = link.match(/tracks\/([^/]+)/);
          if (match) trackId = match[1];
        }
        if (!trackId && title) {
          trackId = title.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
        }

        if (!trackId || !title) continue;

        const status = normalizeTrackStatus(rawStatus);

        let branch = rawBranch ? cleanMarkdown(rawBranch) : undefined;
        if (branch === '-' || branch === '') branch = undefined;

        let note = rawNote ? cleanMarkdown(rawNote) : undefined;
        if (note === '-' || note === '') note = undefined;

        tracks.push({
          trackId,
          title,
          status,
          ...(branch ? { branch } : {}),
          ...(link ? { link } : {}),
          ...(note ? { note } : {}),
        });
      }
    }

    // 2. Fallback: Parse markdown list items if no tracks were extracted from tables
    if (tracks.length === 0) {
      let currentTrack: Partial<PhaseTrackItem> | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const listMatch =
          line.match(/^(?:[-*+]|\d+\.)?\s*\[([ x~])\]\s*(?:\*\*)?(?:Track:\s*)?([^*]+)(?:\*\*)?(.*)$/i) ||
          line.match(/^(?:#+|-|\*)\s*(?:Track:\s*)(.+)$/i);

        if (listMatch) {
          if (currentTrack && currentTrack.trackId && currentTrack.title) {
            tracks.push(currentTrack as PhaseTrackItem);
          }

          const rawStatus = listMatch[1] ? listMatch[1] : '';
          const rawTitle = listMatch[2] ? listMatch[2].trim() : listMatch[0].trim();
          const cleanTitle = cleanMarkdown(rawTitle).replace(/^Track:\s*/i, '').trim();
          const status = normalizeTrackStatus(rawStatus);

          const defaultId = cleanTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');

          currentTrack = {
            trackId: defaultId,
            title: cleanTitle,
            status,
          };
          continue;
        }

        if (currentTrack) {
          const linkMatch = line.match(/(?:Link|Path|URL):\s*(.*)/i);
          if (linkMatch) {
            const extractedLink = extractUrl(linkMatch[1]);
            if (extractedLink) {
              currentTrack.link = extractedLink;
              const idFromLink = extractedLink.match(/tracks\/([^/]+)/);
              if (idFromLink) {
                currentTrack.trackId = idFromLink[1];
              }
            }
            continue;
          }

          const noteMatch = line.match(/(?:Note|Description):\s*(.*)/i);
          if (noteMatch) {
            currentTrack.note = cleanMarkdown(noteMatch[1]);
            continue;
          }
        }
      }

      if (currentTrack && currentTrack.trackId && currentTrack.title) {
        tracks.push(currentTrack as PhaseTrackItem);
      }
    }

    return tracks;
  }

  private static extractAbsorbedFromLines(lines: string[]): AbsorbedTrackItem[] {
    const items: AbsorbedTrackItem[] = [];
    const tableBlocks = this.findTableBlocks(lines);

    for (const tableRows of tableBlocks) {
      if (tableRows.length < 2) continue;

      const headers = this.splitTableRow(tableRows[0]).map((c) => c.toLowerCase().trim());
      const trackIdIdx = headers.findIndex((h) => /^(track[\s_-]?id|id)$/i.test(h));
      const absorbedByIdx = headers.findIndex((h) => /^(absorbed[\s_-]?by|by|merged[\s_-]?into)$/i.test(h));
      const reasonIdx = headers.findIndex((h) => /^(reason|note|notes)$/i.test(h));

      if (trackIdIdx === -1 || absorbedByIdx === -1) continue;

      for (let r = 2; r < tableRows.length; r++) {
        const cells = this.splitTableRow(tableRows[r]);
        if (cells.length === 0) continue;

        const trackId = cleanMarkdown(cells[trackIdIdx] || '');
        const absorbedBy = cleanMarkdown(cells[absorbedByIdx] || '');
        const reason = reasonIdx >= 0 ? cleanMarkdown(cells[reasonIdx] || '') : '';

        if (trackId && absorbedBy) {
          items.push({ trackId, absorbedBy, reason });
        }
      }
    }

    return items;
  }

  private static extractArchivedFromLines(lines: string[]): string[] {
    const items: string[] = [];

    // 1. Look for list items: - `track_id` or - track_id
    for (const line of lines) {
      const match = line.trim().match(/^[-*+]\s+`?([a-z0-9_-]+)`?/i);
      if (match) {
        items.push(match[1]);
      }
    }

    // 2. Also check if archived was formatted as a table
    if (items.length === 0) {
      const tableBlocks = this.findTableBlocks(lines);
      for (const tableRows of tableBlocks) {
        if (tableRows.length < 2) continue;
        const headers = this.splitTableRow(tableRows[0]).map((c) => c.toLowerCase().trim());
        const trackIdIdx = headers.findIndex((h) => /^(track[\s_-]?id|id|track)$/i.test(h));
        if (trackIdIdx === -1) continue;

        for (let r = 2; r < tableRows.length; r++) {
          const cells = this.splitTableRow(tableRows[r]);
          if (cells[trackIdIdx]) {
            const cleanId = cleanMarkdown(cells[trackIdIdx]);
            if (cleanId) items.push(cleanId);
          }
        }
      }
    }

    return items;
  }

  private static findTableBlocks(lines: string[]): string[][] {
    const blocks: string[][] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        currentBlock.push(trimmed);
      } else if (currentBlock.length > 0) {
        if (currentBlock.length >= 2) {
          blocks.push(currentBlock);
        }
        currentBlock = [];
      }
    }

    if (currentBlock.length >= 2) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  private static splitTableRow(row: string): string[] {
    return row
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
  }

  private static formatAlignedTable(headers: string[], rows: string[][]): string[] {
    const colCount = headers.length;
    const colWidths = headers.map((h) => h.length);

    for (const row of rows) {
      for (let c = 0; c < colCount; c++) {
        const cell = row[c] || '';
        if (cell.length > colWidths[c]) {
          colWidths[c] = cell.length;
        }
      }
    }

    // Ensure min width
    for (let c = 0; c < colCount; c++) {
      if (colWidths[c] < 4) colWidths[c] = 4;
    }

    const headerLine =
      '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';
    const dividerLine =
      '|' + colWidths.map((w) => '-'.repeat(w + 2)).join('|') + '|';

    const dataLines = rows.map(
      (row) =>
        '| ' +
        headers.map((_, i) => (row[i] || '').padEnd(colWidths[i])).join(' | ') +
        ' |'
    );

    return [headerLine, dividerLine, ...dataLines];
  }
}
