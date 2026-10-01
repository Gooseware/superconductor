import * as fs from 'fs';
import * as path from 'path';

/**
 * Common English stop words to exclude from keyword extraction.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its',
  'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not',
  'now', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasn', 'we', 'were', 'weren', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'using', 'use', 'create',
  'build', 'implement', 'add', 'make', 'new'
]);

/**
 * Represents a resolved candidate component from either a local codebase symbol
 * or a Design OS / external component registry.
 */
export interface ComponentCandidate {
  /** Unique identifier for the component (e.g. registry ID or symbol/path ID) */
  id: string;
  /** Display name of the component */
  name: string;
  /** Source classification of the candidate */
  source: 'registry' | 'local' | 'block';
  /** Path to the source file if local, or registry URL/path */
  path?: string;
  /** Component family (e.g., 'button', 'card', 'dialog') */
  family?: string;
  /** Component variant (e.g., 'default', 'primary', 'outline') */
  variant?: string;
  /** Human-readable description */
  description?: string;
  /** Tags associated with the component (intent, categories, characteristics) */
  tags?: string[];
  /** Overall relevance score (higher is more relevant) */
  score: number;
  /** Breakdown of reasons why this component matched the query */
  matchReasons?: string[];
  /** Symbol kind for local symbols (e.g., 'class', 'function', 'interface') */
  kind?: string;
  /** Complexity tier (e.g., 'atom', 'molecule', 'organism') */
  complexity?: string;
  /** Whether the component is vetted/verified */
  vetted?: boolean;
  /** Raw metadata from source item */
  metadata?: Record<string, any>;
}

export interface ResolveCandidateOptions {
  /** Array of raw registry items / opinion blocks from Design OS or other registries */
  registryItems?: any[];
  /** Custom path to the 06_api_surface.toon file */
  apiSurfaceToonPath?: string;
  /** Minimum score threshold for candidates to be returned (default: 1) */
  minScore?: number;
  /** Maximum number of candidates to return */
  limit?: number;
  /** Project root directory to locate intelligence artifacts */
  projectRoot?: string;
  /** Whether to include local exported symbols from toon (default: true) */
  includeLocalSymbols?: boolean;
  /** Whether to include registry items (default: true) */
  includeRegistryItems?: boolean;
}

export interface SuggestReusesOptions {
  /** Minimum match score against task description (default: 20) */
  threshold?: number;
  /** Maximum number of recommendations to return (default: unlimited) */
  limit?: number;
  /** Output formatting style: 'id' (default), 'path', or 'name' */
  format?: 'id' | 'path' | 'name';
  /** If true, prefers candidate.path over candidate.id if available */
  preferPath?: boolean;
}

export interface RegistryResolverConfig {
  /** Project root path */
  projectRoot?: string;
  /** Default path to 06_api_surface.toon */
  defaultToonPath?: string;
  /** Default registry items if none supplied at call time */
  defaultRegistryItems?: any[];
  /** Minimum score threshold */
  minScoreThreshold?: number;
}

/**
 * Normalizes tags from arbitrary input formats (arrays, JSON strings, comma-separated strings).
 */
function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(s => String(s).trim()).filter(Boolean);
        }
      } catch {
        // Fall back to comma splitting below
      }
    }
    return trimmed
      .split(',')
      .map(s => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);
  }
  return [];
}

/**
 * Splits text into search tokens, breaking camelCase, kebab-case, snake_case,
 * and stripping punctuation and stop words.
 */
function extractTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  // Expand camelCase and PascalCase (e.g. AstryxCard -> Astryx Card, APIUrl -> API Url)
  const expanded = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2');

  // Match alphanumeric words or hyphenated tokens
  const rawWords = expanded.toLowerCase().match(/[a-z0-9_-]+/g) || [];
  const tokens = new Set<string>();

  for (const raw of rawWords) {
    // If token contains hyphens/underscores, add the parts as well
    const subParts = raw.split(/[-_]+/).filter(Boolean);
    if (subParts.length > 1) {
      for (const part of subParts) {
        if (part.length >= 2 && !STOP_WORDS.has(part)) {
          tokens.add(part);
        }
      }
    }

    const cleaned = raw.replace(/[-_]/g, '');
    if (cleaned.length >= 2 && !STOP_WORDS.has(cleaned)) {
      tokens.add(cleaned);
    }
    if (raw.length >= 2 && !STOP_WORDS.has(raw)) {
      tokens.add(raw);
    }
  }

  return Array.from(tokens);
}

/**
 * Splits a component or symbol name into subwords for flexible matching.
 */
function getSubwords(name: string): string[] {
  if (!name) return [];
  const expanded = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2');
  return expanded
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2);
}

/**
 * Resolver engine for discovering, ranking, and recommending reusable components
 * from local project symbol graphs (06_api_surface.toon) and Design OS Kernel component registries.
 */
export class ComponentRegistryResolver {
  private config: RegistryResolverConfig;

  constructor(config: RegistryResolverConfig = {}) {
    this.config = {
      projectRoot: config.projectRoot || process.cwd(),
      minScoreThreshold: config.minScoreThreshold ?? 1,
      ...config,
    };
  }

  public get projectRoot(): string {
    return this.config.projectRoot || process.cwd();
  }

  /**
   * Resolves candidate components matching the description by querying:
   * 1. Local project exported symbols (reading and parsing 06_api_surface.toon)
   * 2. Registry items / opinion blocks (from Design OS Kernel registry / registry_items schema)
   *
   * Scores candidate components by relevance (family match, tag match, name match, intent match).
   */
  async resolveCandidateComponents(
    description: string,
    options?: { registryItems?: any[]; apiSurfaceToonPath?: string } & ResolveCandidateOptions
  ): Promise<ComponentCandidate[]> {
    if (!description || !description.trim()) {
      return [];
    }

    const minScore = options?.minScore ?? this.config.minScoreThreshold ?? 1;
    const includeLocal = options?.includeLocalSymbols ?? true;
    const includeRegistry = options?.includeRegistryItems ?? true;
    const projectRoot = options?.projectRoot || this.projectRoot;

    // Validate apiSurfaceToonPath against directory traversal and extension requirements
    if (options?.apiSurfaceToonPath) {
      this.resolveToonPath(options.apiSurfaceToonPath, projectRoot);
    }

    const tokens = extractTokens(description);
    if (tokens.length === 0) {
      return [];
    }

    const candidatesMap = new Map<string, ComponentCandidate>();

    // 1. Process Registry Items & Opinion Blocks
    if (includeRegistry) {
      const rawItems = options?.registryItems || this.config.defaultRegistryItems || [];
      for (const item of rawItems) {
        const candidate = this.scoreRegistryItem(item, tokens, description);
        if (candidate && candidate.score >= minScore) {
          const dedupeKey = `${candidate.source}:${candidate.id}`;
          const existing = candidatesMap.get(dedupeKey);
          if (!existing || existing.score < candidate.score) {
            candidatesMap.set(dedupeKey, candidate);
          }
        }
      }
    }

    // 2. Process Local Exported Symbols from 06_api_surface.toon
    if (includeLocal) {
      const toonPath = this.resolveToonPath(options?.apiSurfaceToonPath, projectRoot);
      if (toonPath && fs.existsSync(toonPath)) {
        const localCandidates = this.parseAndScoreToonFile(toonPath, tokens, description, minScore);
        for (const candidate of localCandidates) {
          const dedupeKey = `${candidate.source}:${candidate.id}:${candidate.path || ''}`;
          const existing = candidatesMap.get(dedupeKey);
          if (!existing || existing.score < candidate.score) {
            candidatesMap.set(dedupeKey, candidate);
          }
        }
      }
    }

    // Sort by score descending; break ties by name alphabetically
    const sorted = Array.from(candidatesMap.values()).sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.name.localeCompare(b.name);
    });

    if (options?.limit && options.limit > 0) {
      return sorted.slice(0, options.limit);
    }

    return sorted;
  }

  /**
   * Suggests component paths or IDs from available candidate components for a specific task description.
   * Returns an array of paths/IDs suitable for the REUSES: metadata tag.
   */
  suggestReusesForTask(
    taskDescription: string,
    availableComponents: ComponentCandidate[],
    options?: SuggestReusesOptions
  ): string[] {
    if (!taskDescription || !taskDescription.trim() || !availableComponents || availableComponents.length === 0) {
      return [];
    }

    const threshold = options?.threshold ?? 20;
    const taskTokens = extractTokens(taskDescription);
    const taskDescLower = taskDescription.toLowerCase();

    const scoredMatches: { candidate: ComponentCandidate; taskScore: number }[] = [];

    for (const candidate of availableComponents) {
      let taskScore = 0;
      const candidateIdLower = (candidate.id || '').toLowerCase();
      const candidateNameLower = (candidate.name || '').toLowerCase();
      const candidateFamilyLower = (candidate.family || '').toLowerCase();
      const candidatePath = candidate.path || '';
      const candidatePathLower = candidatePath.toLowerCase();
      const candidateBasenameLower = candidatePath ? path.basename(candidatePath).toLowerCase() : '';

      // Direct ID match in task description (highest confidence)
      if (candidate.id && taskDescLower.includes(candidateIdLower)) {
        taskScore += 100;
      }

      // Direct Name match in task description
      if (candidate.name && taskDescLower.includes(candidateNameLower)) {
        taskScore += 80;
      }

      // Direct Path / Basename match in task description
      if (candidatePath && taskDescLower.includes(candidatePathLower)) {
        taskScore += 80;
      } else if (candidateBasenameLower && taskDescLower.includes(candidateBasenameLower)) {
        taskScore += 60;
      }

      // Family match
      if (candidateFamilyLower) {
        if (taskTokens.some(t => candidateFamilyLower === t)) {
          taskScore += 40;
        } else if (taskTokens.some(t => candidateFamilyLower.includes(t) && t.length >= 3)) {
          taskScore += 20;
        }
      }

      // Name subwords match
      const subwords = getSubwords(candidate.name);
      for (const sw of subwords) {
        if (taskTokens.includes(sw)) {
          taskScore += 25;
        }
      }

      // Tag match
      if (candidate.tags && candidate.tags.length > 0) {
        for (const tag of candidate.tags) {
          const tagLower = tag.toLowerCase();
          if (taskTokens.includes(tagLower)) {
            taskScore += 25;
          } else if (taskTokens.some(t => tagLower.includes(t) && t.length >= 3)) {
            taskScore += 10;
          }
        }
      }

      // Description token match
      if (candidate.description) {
        const descLower = candidate.description.toLowerCase();
        for (const token of taskTokens) {
          if (descLower.includes(token)) {
            taskScore += 10;
          }
        }
      }

      // Base candidate score small contribution (5%)
      taskScore += (candidate.score || 0) * 0.05;

      if (taskScore >= threshold) {
        scoredMatches.push({ candidate, taskScore });
      }
    }

    // Sort by task-specific score descending
    scoredMatches.sort((a, b) => b.taskScore - a.taskScore);

    // Format identifiers
    const recommendations: string[] = [];
    for (const match of scoredMatches) {
      const c = match.candidate;
      let identifier: string;

      if (options?.format === 'path') {
        identifier = c.path || c.id || c.name;
      } else if (options?.format === 'name') {
        identifier = c.name || c.id || c.path || '';
      } else if (options?.preferPath && c.path) {
        identifier = c.path;
      } else {
        identifier = c.id || c.path || c.name;
      }

      if (identifier && !recommendations.includes(identifier)) {
        recommendations.push(identifier);
      }
    }

    if (options?.limit && options.limit > 0) {
      return recommendations.slice(0, options.limit);
    }

    return recommendations;
  }

  /**
   * Evaluates and scores a single registry item or opinion block against description tokens.
   */
  private scoreRegistryItem(
    item: any,
    tokens: string[],
    fullDescription: string
  ): ComponentCandidate | null {
    if (!item) return null;

    const name = item.name || item.family || item.id || 'unnamed-component';
    const family = item.family || '';
    const variant = item.variant || 'default';
    const description = item.description || '';
    const rawType = item.type || (item.id?.includes('block') || item.blockName ? 'block' : 'component');
    const source: 'block' | 'registry' = rawType === 'block' ? 'block' : 'registry';
    const complexity = item.complexity || (source === 'block' ? 'organism' : 'atom');
    const vetted = Boolean(item.vetted === 1 || item.vetted === true);

    const tags = Array.from(
      new Set([
        ...normalizeTags(item.intent_tags),
        ...normalizeTags(item.tags),
        ...normalizeTags(item.categories),
        ...normalizeTags(item.source_characteristics),
      ])
    );

    const id = item.id || `${item.source_id || 'registry'}:${family || name}-${variant}`;
    const matchReasons: string[] = [];
    let score = 0;

    const nameLower = name.toLowerCase();
    const familyLower = family.toLowerCase();
    const descLower = description.toLowerCase();
    const fullDescLower = fullDescription.toLowerCase();

    // 1. Vetted Priority Boost
    if (vetted) {
      score += 30;
      matchReasons.push('vetted priority boost');
    }

    // 2. Family Match (High Relevance)
    if (familyLower) {
      for (const token of tokens) {
        if (familyLower === token) {
          score += 40;
          matchReasons.push(`family match: ${family}`);
          break;
        } else if (familyLower.includes(token) && token.length >= 3) {
          score += 15;
          matchReasons.push(`partial family match: ${family}`);
          break;
        }
      }
    }

    // 3. Name Match (Very High Relevance)
    let nameMatched = false;
    for (const token of tokens) {
      if (nameLower === token) {
        score += 45;
        matchReasons.push(`exact name match: ${name}`);
        nameMatched = true;
        break;
      }
    }
    if (!nameMatched) {
      const nameSubwords = getSubwords(name);
      for (const sw of nameSubwords) {
        if (tokens.includes(sw)) {
          score += 30;
          matchReasons.push(`name subword match: ${sw} in ${name}`);
          nameMatched = true;
          break;
        }
      }
    }
    if (!nameMatched) {
      for (const token of tokens) {
        if (token.length >= 3 && nameLower.includes(token)) {
          score += 15;
          matchReasons.push(`partial name match: ${name}`);
          break;
        }
      }
    }

    // 4. Tag Matches (High Relevance)
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      if (tokens.includes(tagLower)) {
        score += 25;
        matchReasons.push(`tag match: ${tag}`);
      } else if (tokens.some(t => t.length >= 3 && (tagLower.includes(t) || t.includes(tagLower)))) {
        score += 10;
        matchReasons.push(`partial tag match: ${tag}`);
      }
    }

    // 5. Intent / Description Match
    for (const token of tokens) {
      if (descLower.includes(token)) {
        score += 15;
        matchReasons.push(`intent match in description: ${token}`);
      }
    }

    // Exact phrase match in description
    if (descLower && fullDescLower.includes(descLower)) {
      score += 20;
      matchReasons.push('full description phrase match');
    }

    // 6. Type & Complexity Match
    if (tokens.includes('block') && source === 'block') {
      score += 20;
      matchReasons.push('block type match');
    }
    if (tokens.includes('component') && source === 'registry') {
      score += 10;
      matchReasons.push('component type match');
    }
    if (complexity && tokens.includes(complexity.toLowerCase())) {
      score += 15;
      matchReasons.push(`complexity match: ${complexity}`);
    }

    if (score <= 0) {
      return null;
    }

    return {
      id,
      name,
      source,
      family: family || undefined,
      variant: variant || undefined,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      score,
      matchReasons,
      complexity,
      vetted,
      metadata: item,
    };
  }

  /**
   * Locates the 06_api_surface.toon file from options or default search paths.
   * Validates custom paths to prevent directory traversal and enforce the .toon extension.
   */
  private resolveToonPath(customPath?: string, projectRoot?: string): string | null {
    const root = path.resolve(projectRoot || this.projectRoot);
    if (customPath) {
      if (!customPath.endsWith('.toon')) {
        throw new Error(`Invalid apiSurfaceToonPath: "${customPath}" must end with .toon`);
      }
      const resolved = path.resolve(root, customPath);
      const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
      if (resolved !== root && !resolved.startsWith(normalizedRoot)) {
        throw new Error(`Directory traversal detected: "${customPath}" resolves outside project root "${root}"`);
      }
      return resolved;
    }

    const candidates = [
      path.join(root, 'superconductor', 'intelligence', '06_api_surface.toon'),
      path.join(root, 'intelligence', '06_api_surface.toon'),
      path.join(root, '06_api_surface.toon'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
    return null;
  }

  /**
   * Parses 06_api_surface.toon and extracts matching local symbols.
   */
  private parseAndScoreToonFile(
    toonPath: string,
    tokens: string[],
    fullDescription: string,
    minScore: number
  ): ComponentCandidate[] {
    try {
      const content = fs.readFileSync(toonPath, 'utf8');
      if (!content || content === 'null') {
        return [];
      }

      const lines = content.split('\n');
      const candidates: ComponentCandidate[] = [];
      const lowerTokens = tokens.map(t => t.toLowerCase());

      for (const line of lines) {
        if (!line.trim()) continue;

        // Fast line-level filter before JSON parsing
        const lineLower = line.toLowerCase();
        const hasToken = lowerTokens.some(t => lineLower.includes(t));
        if (!hasToken) continue;

        try {
          const item = JSON.parse(line);
          const name = item.name;
          if (!name || name === '$') continue;

          // Exclude internal test variables or anonymous objects
          if (item.scope?.includes('anonymousObject') || name.startsWith('test.')) {
            continue;
          }

          const scored = this.scoreLocalSymbol(item, tokens, fullDescription);
          if (scored && scored.score >= minScore) {
            candidates.push(scored);
          }
        } catch {
          // Ignore invalid JSON lines
        }
      }

      return candidates;
    } catch {
      return [];
    }
  }

  /**
   * Scores an exported local symbol tag against search tokens.
   */
  private scoreLocalSymbol(
    tag: any,
    tokens: string[],
    fullDescription: string
  ): ComponentCandidate | null {
    const name = tag.name;
    const itemPath = tag.path || '';
    const kind = tag.kind || 'symbol';
    const pattern = tag.pattern || '';
    const nameLower = name.toLowerCase();
    const pathLower = itemPath.toLowerCase();
    const basenameLower = itemPath ? path.basename(itemPath).toLowerCase() : '';

    let score = 0;
    const matchReasons: string[] = [];

    // 1. Symbol Name Match
    let nameMatched = false;
    for (const token of tokens) {
      if (nameLower === token) {
        score += 45;
        matchReasons.push(`exact symbol name match: ${name}`);
        nameMatched = true;
        break;
      }
    }
    if (!nameMatched) {
      const subwords = getSubwords(name);
      for (const sw of subwords) {
        if (tokens.includes(sw)) {
          score += 30;
          matchReasons.push(`symbol name subword match: ${sw} in ${name}`);
          nameMatched = true;
          break;
        }
      }
    }
    if (!nameMatched) {
      for (const token of tokens) {
        if (token.length >= 3 && nameLower.includes(token)) {
          score += 15;
          matchReasons.push(`partial symbol name match: ${name}`);
          break;
        }
      }
    }

    // 2. File Path & Basename Match
    if (basenameLower) {
      for (const token of tokens) {
        if (basenameLower.includes(token) && token.length >= 3) {
          score += 20;
          matchReasons.push(`filename match: ${path.basename(itemPath)}`);
          break;
        }
      }
    }
    if (pathLower) {
      for (const token of tokens) {
        if (pathLower.includes(token) && token.length >= 4) {
          score += 10;
          matchReasons.push(`path directory match: ${token}`);
          break;
        }
      }
    }

    // 3. Kind Relevance
    const topLevelKinds = new Set(['class', 'function', 'interface', 'alias', 'enum', 'constant']);
    if (topLevelKinds.has(kind)) {
      score += 10;
    }
    if (tokens.includes(kind.toLowerCase())) {
      score += 15;
      matchReasons.push(`kind match: ${kind}`);
    }

    // 4. Pattern Match
    if (pattern) {
      const patternLower = pattern.toLowerCase();
      for (const token of tokens) {
        if (patternLower.includes(token) && token.length >= 3) {
          score += 10;
          matchReasons.push(`code pattern match: ${token}`);
          break;
        }
      }
    }

    // 5. Test File Adjustment
    if (pathLower.includes('.test.') || pathLower.includes('__tests__')) {
      score -= 25;
    }

    if (score <= 0) {
      return null;
    }

    const tags = [kind, ...(tag.scope ? [tag.scope] : [])].filter(Boolean);
    const id = tag.id || (name ? name : (itemPath ? path.basename(itemPath) : 'local-symbol'));

    return {
      id,
      name,
      source: 'local',
      path: itemPath || undefined,
      kind,
      description: pattern ? `Exported ${kind} ${name}` : undefined,
      tags: tags.length > 0 ? tags : undefined,
      score,
      matchReasons,
      metadata: {
        line: tag.line,
        scope: tag.scope,
        scopeKind: tag.scopeKind,
        pattern: tag.pattern,
      },
    };
  }
}
