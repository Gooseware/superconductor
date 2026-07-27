import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { trackManifestSchema } from '../src/schema/track-manifest.js';

export interface RawTrackEntry {
  id: string;
  name: string;
  status: 'completed' | 'in_progress' | 'planned';
  link: string;
  deps: string[];
  note?: string;
}

export interface TrackManifestYaml {
  version: number;
  tracks: RawTrackEntry[];
}

/**
 * Normalizes track status string into one of 'completed', 'in_progress', 'planned'.
 */
export function normalizeStatus(rawStatus?: string): 'completed' | 'in_progress' | 'planned' {
  if (!rawStatus) return 'planned';
  const statusStr = rawStatus.trim().toLowerCase();
  if (statusStr === 'x' || statusStr === '[x]' || statusStr === 'completed') return 'completed';
  if (statusStr === '~' || statusStr === '[~]' || statusStr === 'in_progress' || statusStr === 'in progress') return 'in_progress';
  return 'planned';
}

/**
 * Cleans markdown formatting (bold, italic, inline code, links) from a string.
 */
export function cleanMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](link) -> text
    .replace(/\*\*([^*]+)\*\*/g, '$1')       // **bold** -> bold
    .replace(/\*([^*]+)\*/g, '$1')           // *italic* -> italic
    .replace(/`([^`]+)`/g, '$1')             // `code` -> code
    .replace(/^[-*+]\s*/, '')                // list prefix
    .trim();
}

/**
 * Extracts URL from markdown link string or returns trimmed text.
 */
export function extractUrl(text: string): string {
  if (!text) return '';
  const linkMatch = text.match(/\[[^\]]*\]\(([^)]+)\)/);
  if (linkMatch) return linkMatch[1].trim();
  return text.replace(/^[*_`\s]+|[*_`\s]+$/g, '').trim();
}

/**
 * Slugifies a track name to generate a valid track ID.
 */
export function slugifyTrackName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parses raw markdown dependencies input string into array of track IDs.
 */
export function parseDependenciesString(depsStr: string): string[] {
  if (!depsStr) return [];

  // Extract from markdown links if any: [id](./link) or [id]
  const linkMatches = [...depsStr.matchAll(/\[([^\]]+)\](?:\(([^)]+)\))?/g)];
  if (linkMatches.length > 0) {
    const extracted: string[] = [];
    for (const m of linkMatches) {
      const label = m[1].trim();
      const href = m[2] ? m[2].trim() : '';
      const hrefIdMatch = href.match(/tracks\/([^/]+)/);
      if (hrefIdMatch) {
        extracted.push(hrefIdMatch[1]);
      } else if (label && label.toLowerCase() !== 'link' && label !== '-') {
        extracted.push(slugifyTrackName(label));
      }
    }
    if (extracted.length > 0) return extracted;
  }

  // Split by comma, semicolon, or space
  return depsStr
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .map(s => cleanMarkdown(s))
    .map(s => s.replace(/^[-[\]\s]+|[-[\]\s]+$/g, ''))
    .filter(s => s.length > 0 && !['none', 'n/a', '-', '[]', 'null', 'undefined'].includes(s.toLowerCase()));
}

/**
 * Main parser function: converts legacy tracks.md markdown content to TrackManifestYaml structure.
 */
export function parseTracksMarkdown(content: string): TrackManifestYaml {
  const tracks: RawTrackEntry[] = [];
  const lines = content.split('\n');

  // Strategy 1: Check for Markdown Tables
  const tableRows: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
    } else if (inTable) {
      // Table ended or interrupted
      if (tableRows.length >= 2) break; // We found a table block
      tableRows.length = 0;
      inTable = false;
    }
  }

  if (tableRows.length >= 2) {
    // Parse table headers
    const headerCells = tableRows[0]
      .split('|')
      .map(c => c.trim().toLowerCase())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    const getColIndex = (patterns: RegExp[]): number => {
      return headerCells.findIndex(h => patterns.some(p => p.test(h)));
    };

    const idIdx = getColIndex([/^(id|track_?id)$/i]);
    const nameIdx = getColIndex([/^(name|title|track|track_?name)$/i]);
    const statusIdx = getColIndex([/^(status|state)$/i]);
    const linkIdx = getColIndex([/^(link|path|url)$/i]);
    const depsIdx = getColIndex([/^(deps|dependencies|prereq|prerequisites|requires)$/i]);
    const noteIdx = getColIndex([/^(note|notes|description|desc)$/i]);

    // Process table data rows (skipping header row [0] and separator row [1])
    for (let i = 2; i < tableRows.length; i++) {
      const cells = tableRows[i]
        .split('|')
        .map(c => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      if (cells.length === 0) continue;

      const rawName = nameIdx >= 0 ? cells[nameIdx] : (cells[0] || '');
      const cleanName = cleanMarkdown(rawName).replace(/^Track:\s*/i, '');
      if (!cleanName) continue;

      const rawLink = linkIdx >= 0 ? cells[linkIdx] : '';
      const link = extractUrl(rawLink);

      let id = idIdx >= 0 ? cleanMarkdown(cells[idIdx]) : '';
      if (!id && link) {
        const idFromLink = link.match(/tracks\/([^/]+)/);
        if (idFromLink) id = idFromLink[1];
      }
      if (!id) {
        id = slugifyTrackName(cleanName);
      }

      const rawStatus = statusIdx >= 0 ? cells[statusIdx] : '';
      const status = normalizeStatus(rawStatus);

      const rawDeps = depsIdx >= 0 ? cells[depsIdx] : '';
      const deps = parseDependenciesString(rawDeps);

      const note = noteIdx >= 0 ? cleanMarkdown(cells[noteIdx]) : undefined;

      tracks.push({
        id,
        name: cleanName,
        status,
        link: link || `./tracks/${id}/`,
        deps,
        note: note || undefined
      });
    }
  }

  // Strategy 2: If no table tracks found, parse Markdown List / Card items
  if (tracks.length === 0) {
    let currentTrack: Partial<RawTrackEntry> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Match item header: - [x] **Track: ...** or * [ ] **Track: ...** or ### Track: ...
      const listMatch = line.match(/^(?:[-*+]|\d+\.)?\s*\[([ x~])\]\s*(?:\*\*)?(?:Track:\s*)?([^*]+)(?:\*\*)?(.*)$/i) ||
                         line.match(/^(?:#+|-|\*)\s*(?:Track:\s*)(.+)$/i);

      if (listMatch) {
        if (currentTrack && currentTrack.name) {
          tracks.push(finalizeTrack(currentTrack));
        }

        const rawStatus = listMatch[1] ? listMatch[1] : '';
        const rawTitle = listMatch[2] ? listMatch[2].trim() : listMatch[0].trim();
        const remainder = listMatch[3] ? listMatch[3].trim() : '';

        // Extract inline note / parentheses like *(requires core abstraction)*
        let inlineNote: string | undefined = undefined;
        const parenMatch = remainder.match(/\*\(([^)]+)\)\*|\(([^)]+)\)/);
        if (parenMatch) {
          inlineNote = (parenMatch[1] || parenMatch[2]).trim();
        }

        const cleanName = cleanMarkdown(rawTitle).replace(/^Track:\s*/i, '').trim();

        currentTrack = {
          name: cleanName,
          status: normalizeStatus(rawStatus),
          deps: [],
          note: inlineNote
        };

        continue;
      }

      if (currentTrack) {
        // Look for Link sub-line: *Link: [./tracks/foo/](./tracks/foo/)*
        const linkMatch = line.match(/(?:Link|Path|URL):\s*(.*)/i);
        if (linkMatch) {
          const extractedLink = extractUrl(linkMatch[1]);
          if (extractedLink) {
            currentTrack.link = extractedLink;
            const idFromLink = extractedLink.match(/tracks\/([^/]+)/);
            if (idFromLink) {
              currentTrack.id = idFromLink[1];
            }
          }
          continue;
        }

        // Look for Dependencies sub-line: - Dependencies: dep1, dep2
        const depsMatch = line.match(/(?:Dependencies|Deps|Prerequisites|Requires):\s*(.*)/i);
        if (depsMatch) {
          currentTrack.deps = parseDependenciesString(depsMatch[1]);
          continue;
        }

        // Look for Note sub-line
        const noteMatch = line.match(/(?:Note|Description):\s*(.*)/i);
        if (noteMatch) {
          currentTrack.note = cleanMarkdown(noteMatch[1]);
          continue;
        }
      }
    }

    if (currentTrack && currentTrack.name) {
      tracks.push(finalizeTrack(currentTrack));
    }
  }

  // Cross-reference notes / text to resolve implicit dependencies
  for (const t of tracks) {
    if (t.note) {
      const noteLower = t.note.toLowerCase();
      const requiresMatch = noteLower.match(/(?:requires|prerequisite(?:\s+for)?|depends\s+on)[:\s]+([^)]+)/i);
      if (requiresMatch) {
        const targetText = requiresMatch[1].trim();
        if (noteLower.includes('prerequisite for')) {
          // Current track is a prerequisite for target track -> target track depends on current track
          for (const targetTrack of tracks) {
            if (targetTrack.id !== t.id && (targetTrack.name.toLowerCase().includes(targetText) || targetTrack.id.toLowerCase().includes(targetText))) {
              if (!targetTrack.deps.includes(t.id)) {
                targetTrack.deps.push(t.id);
              }
            }
          }
        } else {
          // Current track requires target track -> current track depends on target track
          for (const targetTrack of tracks) {
            if (targetTrack.id !== t.id && (targetTrack.name.toLowerCase().includes(targetText) || targetTrack.id.toLowerCase().includes(targetText))) {
              if (!t.deps.includes(targetTrack.id)) {
                t.deps.push(targetTrack.id);
              }
            }
          }
        }
      }
    }
  }

  const manifestData: TrackManifestYaml = {
    version: 1,
    tracks
  };

  // Validate against Zod schema
  const validationResult = trackManifestSchema.safeParse(manifestData);
  if (!validationResult.success) {
    console.warn('Warning: Generated track manifest failed Zod schema validation:', validationResult.error.format());
  }

  return manifestData;
}

function finalizeTrack(partial: Partial<RawTrackEntry>): RawTrackEntry {
  const name = partial.name || 'unnamed_track';
  const id = partial.id || slugifyTrackName(name);
  const link = partial.link || `./tracks/${id}/`;
  return {
    id,
    name,
    status: partial.status || 'planned',
    link,
    deps: partial.deps || [],
    note: partial.note
  };
}

/**
 * Reads tracks.md from inputPath, converts to YAML, and writes to outputPath.
 */
export function migrateTracksFile(inputPath: string, outputPath: string): { success: boolean; trackCount: number; outputPath: string } {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const content = fs.readFileSync(inputPath, 'utf-8');
  const manifest = parseTracksMarkdown(content);

  // Validate schema
  const validation = trackManifestSchema.safeParse(manifest);
  if (!validation.success) {
    throw new Error(`Generated manifest violates trackManifestSchema: ${validation.error.message}`);
  }

  const yamlContent = yaml.dump(manifest, {
    indent: 2,
    lineWidth: -1,
    noRefs: true
  });

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, yamlContent, 'utf-8');

  return {
    success: true,
    trackCount: manifest.tracks.length,
    outputPath
  };
}

// CLI Execution Block
if (process.argv[1]?.includes('migrate-tracks')) {
  try {
    const args = process.argv.slice(2);
    let inputPath = path.join(process.cwd(), 'superconductor', 'tracks.md');
    let outputPath = path.join(process.cwd(), 'superconductor', 'tracks.yaml');

    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '-i' || args[i] === '--input') && args[i + 1]) {
        inputPath = path.resolve(args[i + 1]);
        i++;
      } else if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
        outputPath = path.resolve(args[i + 1]);
        i++;
      } else if (!args[i].startsWith('-') && i === 0) {
        inputPath = path.resolve(args[i]);
      } else if (!args[i].startsWith('-') && i === 1) {
        outputPath = path.resolve(args[i]);
      }
    }

    // Fallback search if input default doesn't exist in process.cwd()
    if (!fs.existsSync(inputPath) && fs.existsSync(path.join(process.cwd(), '..', '..', 'superconductor', 'tracks.md'))) {
      inputPath = path.resolve(process.cwd(), '..', '..', 'superconductor', 'tracks.md');
      outputPath = path.resolve(process.cwd(), '..', '..', 'superconductor', 'tracks.yaml');
    }

    console.log(`Migrating ${inputPath} -> ${outputPath}...`);
    const result = migrateTracksFile(inputPath, outputPath);
    console.log(`✅ Migration complete! Exported ${result.trackCount} tracks to ${result.outputPath}`);
  } catch (err: any) {
    console.error(`❌ Migration failed: ${err?.message || err}`);
    process.exit(1);
  }
}
