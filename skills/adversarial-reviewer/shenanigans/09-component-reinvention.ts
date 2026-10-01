import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ComponentReinventionOptions {
  /** Declared reuses list from plan.md (e.g. ['AstryxCard', 'AstryxButton']) */
  reuses?: string[];
  /** Repository symbol catalog names (from 06_api_surface.toon or caller) */
  symbolCatalog?: (string | { name?: string; path?: string; kind?: string })[];
  /** Registered Golden Source components (from registry_items or caller) */
  registryItems?: (string | { id?: string; name?: string; family?: string; variant?: string })[];
  /** Project root path for resolving 06_api_surface.toon */
  projectRoot?: string;
  /** Explicit path to 06_api_surface.toon */
  toonPath?: string;
}

export interface ReinventionFinding {
  finding_id: string;
  reviewer_id: string;
  file: string;
  line_range: string;
  severity: 'high';
  category: 'adversarial';
  shenanigan: 'component-reinvention';
  description: string;
  recommendation: string;
  is_security_critical: boolean;
  componentName?: string;
  duplicateOf?: string;
  source?: 'symbolCatalog' | 'registryItems' | 'reuses' | 'primitive';
}

export interface ReinventionCheckResult {
  passed: boolean;
  status: 'PASS' | 'NEEDS_FIXES';
  findings: ReinventionFinding[];
  summary: string;
}

interface DiffFileHunk {
  file: string;
  lineRange: string;
  addedLines: { lineNum: number; content: string }[];
  allAddedText: string;
}

interface DeclaredSymbol {
  name: string;
  kind: 'function' | 'class' | 'const' | 'component' | 'jsx-primitive';
  file: string;
  line: number;
}

/**
 * Splits an identifier (camelCase, PascalCase, kebab-case, snake_case, paths) into normalized lowercase tokens.
 */
export function tokenizeIdentifier(name: string): string[] {
  if (!name) return [];
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2')
    .replace(/[-_./:\\]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Known component & helper families for semantic normalization.
 * Uses word-boundary regexes (\b) to avoid substring collisions like
 * /card/i matching "discard" or "wildcard", /table/i matching "isStable" or "selectable",
 * or /select/i matching "selectAll".
 */
export const KNOWN_FAMILIES: [RegExp, string][] = [
  // UI Elements
  [/\b(?:button|btn)s?\b/i, 'button'],
  [/\b(?:card)s?\b/i, 'card'],
  [/\b(?:checkbox|checkboxes)\b/i, 'checkbox'],
  [/\b(?:input|inputs|textfield|textinput)\b/i, 'input'],
  [/\b(?:modal|dialog|popup)s?\b/i, 'modal'],
  [/\b(?:table|grid|datatable)s?\b/i, 'table'],
  [/\b(?:badge|tag|chip)s?\b/i, 'badge'],
  [/\b(?:tooltip)s?\b/i, 'tooltip'],
  [/\b(?:dropdown|combobox)s?\b/i, 'dropdown'],
  [/\b(?:select|selects)\b/i, 'dropdown'],
  [/\b(?:spinner|loader)s?\b/i, 'spinner'],
  [/\b(?:alert|toast|banner|notification)s?\b/i, 'alert'],
  [/\b(?:tabs|tablist)\b/i, 'tabs'],

  // Helper functions
  [/\b(?:clone|cloner|cloning)\b/i, 'cloner'],
  [/\b(?:cache|caching)\b/i, 'cache'],
  [/\b(?:token|tokens|tokenize|tokenizer)\b/i, 'token'],
  [/\b(?:format|formatter|formatting)(?:date|time|currency|number|string)?\b/i, 'formatter'],
  [/\b(?:sanitize|sanitizer|sanitizing)\b/i, 'sanitizer'],
  [/\b(?:debounce|throttle)\b/i, 'debouncer'],
];

/**
 * Extracts normalized family category from symbol name using token boundary matching.
 */
export function extractFamily(name: string): string | null {
  if (!name) return null;
  const tokens = tokenizeIdentifier(name);
  if (tokens.length === 0) return null;

  // Action / predicate verbs that contain "select" but are not UI dropdown components
  // e.g. selectAll, selectNone, selectRow, selectRows, isSelected
  if (
    tokens.includes('select') &&
    (tokens.includes('all') ||
      tokens.includes('none') ||
      tokens.includes('row') ||
      tokens.includes('rows') ||
      tokens.includes('item') ||
      tokens.includes('is'))
  ) {
    return null;
  }

  const tokenizedString = tokens.join(' ');
  for (const [regex, fam] of KNOWN_FAMILIES) {
    if (regex.test(tokenizedString)) {
      return fam;
    }
  }
  return null;
}

/**
 * Normalizes symbol names from symbolCatalog option or 06_api_surface.toon.
 */
function normalizeSymbolNames(
  rawList?: (string | { name?: string; path?: string; kind?: string })[]
): Set<string> {
  const result = new Set<string>();
  if (!rawList || !Array.isArray(rawList)) return result;

  for (const item of rawList) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed.name === 'string') {
            result.add(parsed.name);
          }
        } catch {
          result.add(trimmed);
        }
      } else if (trimmed) {
        result.add(trimmed);
      }
    } else if (item && typeof item === 'object' && typeof item.name === 'string') {
      result.add(item.name);
    }
  }
  return result;
}

/**
 * Normalizes registry item names from registryItems option.
 */
function normalizeRegistryItems(
  rawList?: (string | { id?: string; name?: string; family?: string })[]
): Map<string, { name: string; family?: string }> {
  const result = new Map<string, { name: string; family?: string }>();
  if (!rawList || !Array.isArray(rawList)) return result;

  for (const item of rawList) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (name) {
        const fam = extractFamily(name);
        result.set(name.toLowerCase(), { name, family: fam ?? undefined });
      }
    } else if (item && typeof item === 'object') {
      const name = item.name || item.id;
      if (name) {
        const fam = item.family || extractFamily(name);
        result.set(name.toLowerCase(), { name, family: fam ?? undefined });
      }
    }
  }
  return result;
}

/**
 * Resolves repository symbol catalog from 06_api_surface.toon if not provided.
 */
function loadSymbolCatalogFallback(projectRoot?: string, toonPath?: string): Set<string> {
  const symbols = new Set<string>();
  const candidates: string[] = [];

  if (toonPath) {
    candidates.push(toonPath);
  }
  const root = projectRoot || process.cwd();
  candidates.push(
    path.join(root, 'superconductor/intelligence/06_api_surface.toon'),
    path.join(root, 'intelligence/06_api_surface.toon'),
    'superconductor/intelligence/06_api_surface.toon'
  );

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed.name === 'string') {
              symbols.add(parsed.name);
            }
          } catch {
            // Ignore malformed line
          }
        }
        if (symbols.size > 0) break;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return symbols;
}

/**
 * Parses diff text into structured file hunks.
 */
function parseDiffHunks(diffText: string): DiffFileHunk[] {
  const hunks: DiffFileHunk[] = [];
  const lines = diffText.split('\n');

  let currentFile = 'unknown-file.ts';
  let currentStartLine = 1;
  let currentAddedLines: { lineNum: number; content: string }[] = [];
  let lineCounter = 1;
  let hasDiffHeaders = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header detection
    if (line.startsWith('diff --git')) {
      hasDiffHeaders = true;
      if (currentAddedLines.length > 0) {
        hunks.push({
          file: currentFile,
          lineRange: `L${currentStartLine}-L${currentStartLine + currentAddedLines.length - 1}`,
          addedLines: [...currentAddedLines],
          allAddedText: currentAddedLines.map((l) => l.content).join('\n'),
        });
        currentAddedLines = [];
      }
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      if (match) currentFile = match[1];
      continue;
    }

    if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
      hasDiffHeaders = true;
      const stripped = line.replace(/^\+\+\+\s+(?:b\/)?/, '').trim();
      if (stripped && stripped !== '/dev/null') {
        currentFile = stripped;
      }
      continue;
    }

    // Chunk header @@ -x,y +a,b @@
    const chunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (chunkMatch) {
      hasDiffHeaders = true;
      lineCounter = parseInt(chunkMatch[1], 10);
      currentStartLine = lineCounter;
      continue;
    }

    // Added line
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const codeLine = line.slice(1);
      currentAddedLines.push({ lineNum: lineCounter, content: codeLine });
      lineCounter++;
    } else if (line.startsWith('-')) {
      // Deleted line, skip
      continue;
    } else {
      // Context line
      lineCounter++;
    }
  }

  // If not formatted as git diff, treat entire input as added lines
  if (!hasDiffHeaders) {
    const rawAdded = lines.map((content, idx) => ({ lineNum: idx + 1, content }));
    hunks.push({
      file: currentFile,
      lineRange: `L1-L${lines.length}`,
      addedLines: rawAdded,
      allAddedText: lines.join('\n'),
    });
  } else if (currentAddedLines.length > 0) {
    hunks.push({
      file: currentFile,
      lineRange: `L${currentStartLine}-L${currentStartLine + currentAddedLines.length - 1}`,
      addedLines: currentAddedLines,
      allAddedText: currentAddedLines.map((l) => l.content).join('\n'),
    });
  }

  return hunks;
}

/**
 * Extracts declared symbols and components from added lines in a hunk.
 */
function extractDeclaredSymbols(hunk: DiffFileHunk): DeclaredSymbol[] {
  const declared: DeclaredSymbol[] = [];

  for (const { lineNum, content } of hunk.addedLines) {
    const trimmed = content.trim();

    // Ignore comments and import statements
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('import{') ||
      trimmed.startsWith('from ') ||
      /export\s+(?:\{|\*)\s*from/.test(trimmed)
    ) {
      continue;
    }

    // 1. Function declaration: export? default? async? function Name
    const fnMatch = trimmed.match(
      /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/
    );
    if (fnMatch) {
      declared.push({
        name: fnMatch[1],
        kind: 'function',
        file: hunk.file,
        line: lineNum,
      });
      continue;
    }

    // 2. Class declaration: export? default? class Name
    const classMatch = trimmed.match(/(?:export\s+(?:default\s+)?)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      declared.push({
        name: classMatch[1],
        kind: 'class',
        file: hunk.file,
        line: lineNum,
      });
      continue;
    }

    // 3. Const / let / var assignment: export? const Name = ...
    const varMatch = trimmed.match(
      /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*(?::\s*[^=]+)?\s*=\s*(?:(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>|function|React\.(?:memo|forwardRef)|class|<)/
    );
    if (varMatch) {
      declared.push({
        name: varMatch[1],
        kind: 'component',
        file: hunk.file,
        line: lineNum,
      });
      continue;
    }

    // 4. Simple const arrow or function definition: const Name = (...) =>
    const arrowMatch = trimmed.match(
      /(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/
    );
    if (arrowMatch) {
      declared.push({
        name: arrowMatch[1],
        kind: 'function',
        file: hunk.file,
        line: lineNum,
      });
      continue;
    }

    // 5. Hand-rolled custom primitive JSX elements (e.g. <button onClick=...>, <input ...>)
    // when custom primitive markup is introduced inside a component
    const rawPrimitiveMatch = trimmed.match(/<(button|input|table|modal|dialog)\b[^>]*>/i);
    if (rawPrimitiveMatch) {
      const primitiveTag = rawPrimitiveMatch[1].toLowerCase();
      declared.push({
        name: `<${primitiveTag}>`,
        kind: 'jsx-primitive',
        file: hunk.file,
        line: lineNum,
      });
    }
  }

  return declared;
}

/**
 * Checks a PR or diff against repository symbols, Golden Source components,
 * and declared REUSES tags for component reinvention and non-DRY redundancy.
 *
 * @param diffText - Unified git diff or source code string
 * @param options  - Comparison catalog and reuse configurations
 * @returns ReinventionCheckResult with status 'PASS' or 'NEEDS_FIXES' and structured findings
 */
export function checkComponentReinvention(
  diffText: string,
  options?: ComponentReinventionOptions
): ReinventionCheckResult {
  const findings: ReinventionFinding[] = [];
  let findingCounter = 1;

  if (!diffText || !diffText.trim()) {
    return {
      passed: true,
      status: 'PASS',
      findings: [],
      summary: 'Clean pass: no diff text provided for adversarial DRY review.',
    };
  }

  // 1. Prepare catalogs
  const symbolCatalog =
    options?.symbolCatalog && options.symbolCatalog.length > 0
      ? normalizeSymbolNames(options.symbolCatalog)
      : loadSymbolCatalogFallback(options?.projectRoot, options?.toonPath);

  const registryItems = normalizeRegistryItems(options?.registryItems);
  const declaredReuses = options?.reuses || [];

  // Index catalog symbols by lowercase and by family for fuzzy detection
  const catalogLowerMap = new Map<string, string>();
  const catalogFamilyMap = new Map<string, string[]>();
  for (const sym of symbolCatalog) {
    catalogLowerMap.set(sym.toLowerCase(), sym);
    const fam = extractFamily(sym);
    if (fam) {
      const list = catalogFamilyMap.get(fam) || [];
      list.push(sym);
      catalogFamilyMap.set(fam, list);
    }
  }

  // Index registry items by family
  const registryFamilyMap = new Map<string, string[]>();
  for (const [, item] of registryItems) {
    if (item.family) {
      const list = registryFamilyMap.get(item.family) || [];
      list.push(item.name);
      registryFamilyMap.set(item.family, list);
    }
  }

  // Index declared reuses
  const reusesLowerMap = new Map<string, string>();
  const reusesFamilyMap = new Map<string, string[]>();
  for (const r of declaredReuses) {
    reusesLowerMap.set(r.toLowerCase(), r);
    const fam = extractFamily(r);
    if (fam) {
      const list = reusesFamilyMap.get(fam) || [];
      list.push(r);
      reusesFamilyMap.set(fam, list);
    }
  }

  // 2. Parse diff into hunks
  const hunks = parseDiffHunks(diffText);

  // 3. Inspect each hunk
  for (const hunk of hunks) {
    const declaredSymbols = extractDeclaredSymbols(hunk);

    for (const sym of declaredSymbols) {
      const symName = sym.name;
      const symLower = symName.toLowerCase();
      const symFam = extractFamily(symName);

      // Check A: Duplicating declared REUSES tags from plan.md
      if (declaredReuses.length > 0) {
        // Direct name match or family match against declared reuses
        let matchedReuse: string | undefined;
        if (reusesLowerMap.has(symLower)) {
          matchedReuse = reusesLowerMap.get(symLower);
        } else if (symFam && reusesFamilyMap.has(symFam)) {
          const candidates = reusesFamilyMap.get(symFam)!;
          // If the declared symbol is not the reused component itself, it's hand-rolling an alternative
          matchedReuse = candidates.find((c) => c.toLowerCase() !== symLower) || candidates[0];
        }

        if (matchedReuse) {
          findings.push({
            finding_id: `ADV-DRY-${findingCounter++}`,
            reviewer_id: 'adversarial-reviewer',
            file: sym.file,
            line_range: `L${sym.line}`,
            severity: 'high',
            category: 'adversarial',
            shenanigan: 'component-reinvention',
            componentName: symName,
            duplicateOf: matchedReuse,
            source: 'reuses',
            description: `Component Reinvention / Non-DRY Redundancy: hand-rolling custom '${symName}' duplicates declared REUSES component '${matchedReuse}' from plan.md.`,
            recommendation: `Import and reuse declared component '${matchedReuse}' instead of hand-rolling custom '${symName}'.`,
            is_security_critical: false,
          });
          continue; // Avoid duplicate finding for the same symbol
        }
      }

      // Check B: Duplicating registered Golden Source components
      if (registryItems.size > 0) {
        let matchedRegistry: string | undefined;
        if (registryItems.has(symLower)) {
          matchedRegistry = registryItems.get(symLower)!.name;
        } else if (symFam && registryFamilyMap.has(symFam)) {
          const candidates = registryFamilyMap.get(symFam)!;
          matchedRegistry = candidates[0];
        }

        if (matchedRegistry) {
          findings.push({
            finding_id: `ADV-DRY-${findingCounter++}`,
            reviewer_id: 'adversarial-reviewer',
            file: sym.file,
            line_range: `L${sym.line}`,
            severity: 'high',
            category: 'adversarial',
            shenanigan: 'component-reinvention',
            componentName: symName,
            duplicateOf: matchedRegistry,
            source: 'registryItems',
            description: `Component Reinvention / Non-DRY Redundancy: hand-rolling custom '${symName}' duplicates registered Golden Source component '${matchedRegistry}'.`,
            recommendation: `Import and use registered Golden Source component '${matchedRegistry}' instead of hand-rolling custom primitives.`,
            is_security_critical: false,
          });
          continue;
        }
      }

      // Check C: Duplicating existing symbols in repository symbol catalog
      // Only flags if the introduced symbol is a custom primitive, UI element, or helper function
      if (symbolCatalog.size > 0 && symFam) {
        let matchedCatalog: string | undefined;
        if (catalogLowerMap.has(symLower)) {
          matchedCatalog = catalogLowerMap.get(symLower);
        } else if (catalogFamilyMap.has(symFam)) {
          const candidates = catalogFamilyMap.get(symFam)!;
          matchedCatalog = candidates[0];
        }

        if (matchedCatalog) {
          findings.push({
            finding_id: `ADV-DRY-${findingCounter++}`,
            reviewer_id: 'adversarial-reviewer',
            file: sym.file,
            line_range: `L${sym.line}`,
            severity: 'high',
            category: 'adversarial',
            shenanigan: 'component-reinvention',
            componentName: symName,
            duplicateOf: matchedCatalog,
            source: 'symbolCatalog',
            description: `Component Reinvention / Non-DRY Redundancy: hand-rolling '${symName}' duplicates existing component '${matchedCatalog}' in repository symbol catalog.`,
            recommendation: `Reuse existing '${matchedCatalog}' from the repository symbol catalog instead of introducing duplicate '${symName}'.`,
            is_security_critical: false,
          });
          continue;
        }
      }
    }

    // Check D: Ignored declared REUSES tags in the diff
    if (declaredReuses.length > 0) {
      for (const reuseItem of declaredReuses) {
        const reuseFam = extractFamily(reuseItem);
        if (!reuseFam) continue;

        // Check if diff adds UI code related to this family
        // Filter out comment lines (lines starting with //, *, /*, #, <!--)
        const nonCommentAddedLines = hunk.addedLines.filter((l) => {
          const trimmed = l.content.trim();
          return !(
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('<!--')
          );
        });

        const familyBoundaryRegex = new RegExp(`\\b${reuseFam}s?\\b`, 'i');
        const hasFamilyCode = nonCommentAddedLines.some((l) => {
          const content = l.content;
          return (
            familyBoundaryRegex.test(content) ||
            (reuseFam === 'button' && (/<button\b/i.test(content) || /\bbuttons?\b/i.test(content))) ||
            (reuseFam === 'card' && (/\bcards?\b/i.test(content) || /\bcard-[a-z0-9_-]+\b/i.test(content))) ||
            (reuseFam === 'table' && (/<table\b/i.test(content) || /\btables?\b/i.test(content))) ||
            (reuseFam === 'checkbox' && (content.toLowerCase().includes('type="checkbox"') || /\bcheckbox(?:es)?\b/i.test(content))) ||
            (reuseFam === 'modal' && (/\bmodals?\b/i.test(content) || /\bdialogs?\b/i.test(content) || /<dialog\b/i.test(content)))
          );
        });

        // Check if the declared reuse item is actually imported or used in the diff
        const usesDeclaredReuse = hunk.allAddedText.includes(reuseItem);

        if (hasFamilyCode && !usesDeclaredReuse) {
          // If we haven't already flagged a specific symbol for this reuse item
          const alreadyFlagged = findings.some(
            (f) => f.duplicateOf === reuseItem && f.file === hunk.file
          );
          if (!alreadyFlagged) {
            findings.push({
              finding_id: `ADV-DRY-${findingCounter++}`,
              reviewer_id: 'adversarial-reviewer',
              file: hunk.file,
              line_range: hunk.lineRange,
              severity: 'high',
              category: 'adversarial',
              shenanigan: 'component-reinvention',
              duplicateOf: reuseItem,
              source: 'reuses',
              description: `Component Reinvention / Non-DRY Redundancy: diff introduces ${reuseFam} implementation but ignores declared REUSES item '${reuseItem}' from plan.md.`,
              recommendation: `Import and use declared component '${reuseItem}' instead of hand-rolling custom ${reuseFam} markup.`,
              is_security_critical: false,
            });
          }
        }
      }
    }
  }

  const passed = findings.length === 0;
  const status = passed ? 'PASS' : 'NEEDS_FIXES';
  const summary = passed
    ? 'Clean pass: no component reinvention or non-DRY redundancy detected.'
    : `Adversarial review flagged ${findings.length} Component Reinvention / Non-DRY Redundancy violation(s). Status: NEEDS_FIXES.`;

  return {
    passed,
    status,
    findings,
    summary,
  };
}

export default checkComponentReinvention;
