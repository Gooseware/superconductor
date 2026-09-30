/**
 * Quorum Composition Resolver
 *
 * Resolves the dynamic reviewer panel for Quorum reviews based on modified files,
 * impacted domains, diff, or task intent.
 *
 * Invariants:
 *  1. RegressionReviewer ('regression-reviewer') is ALWAYS included (omnipresent).
 *  2. UxReviewer ('ux-reviewer') is mandatory whenever files match *.tsx, *.jsx,
 *     *.vue, *.svelte, *.css, *.scss, *.html, locales/, or copy/text in UI components.
 *  3. SecurityReviewer ('security-reviewer') is included for auth, network, storage,
 *     env, or API files.
 *  4. CorrectnessReviewer ('correctness-reviewer') and AdversarialReviewer
 *     ('adversarial-reviewer') are included for all code/logic changes.
 *  5. Full 5-seat quorum ('security', 'correctness', 'adversarial', 'regression', 'ux')
 *     is returned when multiple files or cross-cutting changes are present.
 */

export type CanonicalQuorumReviewerRole =
  | 'security-reviewer'
  | 'correctness-reviewer'
  | 'adversarial-reviewer'
  | 'regression-reviewer'
  | 'ux-reviewer';

export type ShortQuorumReviewerRole =
  | 'security'
  | 'correctness'
  | 'adversarial'
  | 'regression'
  | 'ux';

export type QuorumReviewerRole =
  | CanonicalQuorumReviewerRole
  | ShortQuorumReviewerRole
  | (string & {});

export const CANONICAL_5_SEAT_QUORUM: readonly CanonicalQuorumReviewerRole[] = [
  'security-reviewer',
  'correctness-reviewer',
  'adversarial-reviewer',
  'regression-reviewer',
  'ux-reviewer',
] as const;

export const SHORT_5_SEAT_QUORUM: readonly ShortQuorumReviewerRole[] = [
  'security',
  'correctness',
  'adversarial',
  'regression',
  'ux',
] as const;

export const ROLE_CANONICAL_TO_SHORT: Record<CanonicalQuorumReviewerRole, ShortQuorumReviewerRole> = {
  'security-reviewer': 'security',
  'correctness-reviewer': 'correctness',
  'adversarial-reviewer': 'adversarial',
  'regression-reviewer': 'regression',
  'ux-reviewer': 'ux',
};

export const ROLE_SHORT_TO_CANONICAL: Record<ShortQuorumReviewerRole, CanonicalQuorumReviewerRole> = {
  security: 'security-reviewer',
  correctness: 'correctness-reviewer',
  adversarial: 'adversarial-reviewer',
  regression: 'regression-reviewer',
  ux: 'ux-reviewer',
};

export interface QuorumOptions {
  /** If true, forces the full 5-seat quorum regardless of file count or patterns */
  forceFullQuorum?: boolean;
  /** If true, indicates changes are cross-cutting across subsystems */
  crossCutting?: boolean;
  /** Explicit override indicating UI or user-facing copy changes are present */
  hasUiChanges?: boolean;
  /** Explicit override indicating auth/network/storage/env/API security impact */
  hasSecurityImpact?: boolean;
  /** Explicit override indicating code or logic changes are present */
  hasCodeChanges?: boolean;
  /** Role identifier format: 'full' ('*-reviewer') or 'short' ('security', etc.) */
  format?: 'full' | 'short';
  /** Alias for format: 'short' when true */
  shortNames?: boolean;
  /** Additional reviewer roles to include */
  extraRoles?: (QuorumReviewerRole | string)[];
  /** Impacted domains (e.g. ['frontend', 'security', 'logic', 'copy']) */
  domains?: string[];
  /** Task intent or description */
  intent?: string;
  /** Git diff content */
  diff?: string;
  /** Whether the change represents a multi-file scope */
  isMultiFile?: boolean;
  /** Track identifier */
  trackId?: string;
}

export interface QuorumResolutionContext extends QuorumOptions {
  files?: string[];
}

export type QuorumResolutionInput = string[] | QuorumResolutionContext;

const FRONTEND_EXTENSIONS = new Set([
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svg',
]);

const FRONTEND_PATH_PATTERNS = [
  'ui/',
  'components/',
  'pages/',
  'styles/',
  'templates/',
  'views/',
  'layouts/',
  'theme/',
  'themes/',
];

const LOCALES_AND_COPY_PATH_PATTERNS = [
  'locales/',
  'locale/',
  'i18n/',
  'strings/',
  'messages/',
  'copy/',
  'docs/',
  'content/',
];

const COPY_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.po',
  '.pot',
]);

const UI_COPY_KEYWORDS = [
  'copy',
  'strings',
  'messages',
  'labels',
  'translations',
  'prompt',
  'wording',
];

const UI_UX_KEYWORDS = [
  'ui',
  'ux',
  'frontend',
  'front-end',
  'style',
  'styles',
  'styling',
  'css',
  'theme',
  'layout',
  'component',
  'components',
  'banner',
  'cli',
  'prompt',
  'terminal',
  'copy',
  'wording',
  'typo',
  'text',
  'label',
  'messages',
  'error message',
  'button',
  'modal',
  'view',
];

const SECURITY_KEYWORDS = [
  'auth',
  'login',
  'oauth',
  'token',
  'jwt',
  'session',
  'password',
  'credential',
  'rbac',
  'permission',
  'authoriz',
  'network',
  'http',
  'fetch',
  'socket',
  'websocket',
  'rpc',
  'proxy',
  'storage',
  'database',
  'sql',
  'mongo',
  'redis',
  'cookie',
  'keytar',
  'persist',
  'cache',
  'store',
  'sqlite',
  'libsql',
  'crypto',
  'cipher',
  'secret',
  'cert',
  'tls',
  'ssl',
  'hash',
];

const SECURITY_PATH_PATTERNS = [
  '/api/',
  'api/',
  '/routes/',
  '/route.',
  '/controllers/',
  'controller',
  '/endpoints/',
  '/graphql/',
  '/server/',
  '.env',
  '/env/',
  'config/env',
  'environment',
  '/db/',
  'db/',
  '/database/',
  'database/',
  '/storage/',
  'storage/',
  '/repository/',
  '/repositories/',
  'repository',
  'repo',
];

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.sql',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
]);

/**
 * Helper: Detect whether a file represents frontend/UI assets or copy in UI components.
 */
export function isUiFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.replace(/\\/g, '/').toLowerCase();

  // Extension check
  for (const ext of FRONTEND_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  // Locales / i18n check
  if (
    lower.includes('/locales/') ||
    lower.startsWith('locales/') ||
    lower.includes('/locale/') ||
    lower.startsWith('locale/') ||
    lower.includes('/i18n/') ||
    lower.startsWith('i18n/') ||
    lower.includes('locales.')
  ) {
    return true;
  }

  // UI component directories
  if (FRONTEND_PATH_PATTERNS.some((pattern) => lower.includes(pattern) || lower.startsWith(pattern))) {
    return true;
  }

  // Copy or text filenames in UI contexts
  const filename = lower.split('/').pop() || '';
  if (UI_COPY_KEYWORDS.some((kw) => filename.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Helper: Detect whether a file relates to auth, network, storage, env, or API files.
 */
export function isSecurityFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.replace(/\\/g, '/').toLowerCase();
  const filename = lower.split('/').pop() || '';

  // Direct environment files
  if (
    filename === '.env' ||
    filename.startsWith('.env.') ||
    lower.includes('/env/') ||
    lower.includes('environment')
  ) {
    return true;
  }

  // API files
  if (
    filename.endsWith('.api.ts') ||
    filename.endsWith('.api.js') ||
    SECURITY_PATH_PATTERNS.some((pattern) => lower.includes(pattern) || lower.startsWith(pattern))
  ) {
    return true;
  }

  // Security / Auth / Network / Storage / Crypto keywords
  if (SECURITY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Helper: Detect whether a file represents code/logic changes.
 */
export function isCodeFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.replace(/\\/g, '/').toLowerCase();

  // Styling-only files are not code/logic
  const styleOnlyExtensions = ['.css', '.scss', '.sass', '.less'];
  if (styleOnlyExtensions.some((ext) => lower.endsWith(ext))) {
    return false;
  }

  for (const ext of CODE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  return false;
}

/**
 * Helper: Detect whether a file represents user-facing copy or documentation.
 */
export function isCopyFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.replace(/\\/g, '/').toLowerCase();
  for (const ext of COPY_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return LOCALES_AND_COPY_PATH_PATTERNS.some(
    (pattern) => lower.includes(pattern) || lower.startsWith(pattern)
  );
}

export class QuorumCompositionResolver {
  public static readonly BASE_ROLES: readonly string[] = [
    'security-reviewer',
    'correctness-reviewer',
    'adversarial-reviewer',
    'regression-reviewer',
  ];

  public static readonly UX_ROLE = 'ux-reviewer';

  /**
   * Determine whether the given file path represents frontend or UI assets.
   */
  public isFrontendFile(filePath: string): boolean {
    return isUiFile(filePath);
  }

  /**
   * Determine whether the given file path represents user-facing copy or documentation.
   */
  public isCopyFile(filePath: string): boolean {
    return isCopyFile(filePath);
  }

  /**
   * Resolves the required QuorumReviewerRoles for a set of changed files based on strict invariants.
   *
   * Invariants:
   * 1. RegressionReviewer is ALWAYS included (omnipresent).
   * 2. UxReviewer ('ux-reviewer') is mandatory whenever files match *.tsx, *.jsx, *.vue,
   *    *.svelte, *.css, *.scss, *.html, locales/, or copy/text in UI components.
   * 3. SecurityReviewer is included for auth, network, storage, env, or API files.
   * 4. CorrectnessReviewer and AdversarialReviewer are included for all code/logic changes.
   * 5. Full 5-seat quorum ('security', 'correctness', 'adversarial', 'regression', 'ux')
   *    is returned when multiple files or cross-cutting changes are present.
   *
   * @param files List of modified file paths.
   * @param options Quorum configuration options.
   * @returns Array of reviewer roles.
   */
  public static resolveQuorum(
    files: string[],
    options: QuorumOptions = {}
  ): QuorumReviewerRole[] {
    const isShort = options.format === 'short' || options.shortNames === true;

    const formatRole = (role: CanonicalQuorumReviewerRole): QuorumReviewerRole => {
      return isShort ? ROLE_CANONICAL_TO_SHORT[role] : role;
    };

    const sanitizedFiles = Array.isArray(files)
      ? Array.from(new Set(files.filter((f) => typeof f === 'string' && f.trim().length > 0)))
      : [];

    const isCrossCutting = Boolean(
      options.crossCutting || options.forceFullQuorum || options.isMultiFile
    );
    const isMultipleFiles = sanitizedFiles.length > 1;

    // Invariant 5: Full 5-seat quorum returned when multiple files or cross-cutting changes are present
    if (isMultipleFiles || isCrossCutting) {
      const fullSeats = CANONICAL_5_SEAT_QUORUM.map(formatRole);
      if (options.extraRoles && options.extraRoles.length > 0) {
        return Array.from(new Set([...fullSeats, ...options.extraRoles])) as QuorumReviewerRole[];
      }
      return fullSeats;
    }

    const activeRoles = new Set<CanonicalQuorumReviewerRole>();

    // Invariant 1: RegressionReviewer is ALWAYS included (omnipresent)
    activeRoles.add('regression-reviewer');

    if (sanitizedFiles.length === 0) {
      if (options.hasUiChanges) {
        activeRoles.add('ux-reviewer');
      }
      if (options.hasSecurityImpact) {
        activeRoles.add('security-reviewer');
      }
      if (options.hasCodeChanges) {
        activeRoles.add('correctness-reviewer');
        activeRoles.add('adversarial-reviewer');
      }
    } else {
      const file = sanitizedFiles[0];

      // Invariant 2: UxReviewer mandatory for UI/copy files
      if (isUiFile(file) || isCopyFile(file) || options.hasUiChanges) {
        activeRoles.add('ux-reviewer');
      }

      // Invariant 3: SecurityReviewer for auth, network, storage, env, or API files
      if (isSecurityFile(file) || options.hasSecurityImpact) {
        activeRoles.add('security-reviewer');
      }

      // Invariant 4: Correctness and Adversarial for code/logic changes
      if (isCodeFile(file) || options.hasCodeChanges) {
        activeRoles.add('correctness-reviewer');
        activeRoles.add('adversarial-reviewer');
      }
    }

    // Preserve deterministic canonical seat order: security, correctness, adversarial, regression, ux
    const ordered = CANONICAL_5_SEAT_QUORUM.filter((role) => activeRoles.has(role)).map(
      formatRole
    );

    if (options.extraRoles && options.extraRoles.length > 0) {
      return Array.from(new Set([...ordered, ...options.extraRoles])) as QuorumReviewerRole[];
    }

    return ordered;
  }

  /**
   * Instance method for resolveQuorum.
   */
  public resolveQuorum(
    files: string[],
    options?: QuorumOptions
  ): QuorumReviewerRole[] {
    return QuorumCompositionResolver.resolveQuorum(files, options);
  }

  /**
   * Resolves the required quorum reviewer panel for compatibility with micro-swarm and legacy callers.
   *
   * @param input List of modified file paths, or QuorumResolutionContext object.
   * @returns Array of reviewer role identifiers.
   */
  public resolve(input?: QuorumResolutionInput): string[] {
    let context: QuorumResolutionContext;

    if (Array.isArray(input)) {
      context = { files: input };
    } else {
      context = input ?? {};
    }

    const files = context.files ?? [];
    const domains = (context.domains ?? []).map((d) => d.toLowerCase());
    const isMultiFile = context.isMultiFile ?? files.length > 1;

    let requiresUx = false;

    // 1. Check if multi-file change (default to full 5-reviewer panel)
    if (isMultiFile) {
      requiresUx = true;
    }

    // 2. Check domains
    if (!requiresUx) {
      const uxDomains = ['frontend', 'copy', 'ui', 'ux', 'ux-review', 'skills-ux-reviewer'];
      if (domains.some((d) => uxDomains.some((ud) => d.includes(ud)))) {
        requiresUx = true;
      }
    }

    // 3. Check modified files
    if (!requiresUx && files.length > 0) {
      for (const file of files) {
        if (this.isFrontendFile(file) || this.isCopyFile(file)) {
          requiresUx = true;
          break;
        }
      }
    }

    // 4. Check intent / diff keywords
    if (!requiresUx) {
      const textToScan = [context.intent, context.diff].filter(Boolean).join(' ').toLowerCase();
      if (textToScan.length > 0) {
        requiresUx = UI_UX_KEYWORDS.some((kw) => {
          const regex = new RegExp(`\\b${kw}\\b`, 'i');
          return regex.test(textToScan);
        });
      }
    }

    // Base panel always includes regression-reviewer
    const panel = [...QuorumCompositionResolver.BASE_ROLES];

    if (requiresUx) {
      panel.push(QuorumCompositionResolver.UX_ROLE);
    }

    return panel;
  }

  /**
   * Alias for resolve().
   */
  public resolvePanel(input?: QuorumResolutionInput): string[] {
    return this.resolve(input);
  }

  /**
   * Static convenience helper for resolve().
   */
  public static resolve(input?: QuorumResolutionInput): string[] {
    const resolver = new QuorumCompositionResolver();
    return resolver.resolve(input);
  }
}

/**
 * Standalone convenience function for resolveQuorum.
 */
export function resolveQuorum(
  files: string[],
  options?: QuorumOptions
): QuorumReviewerRole[] {
  return QuorumCompositionResolver.resolveQuorum(files, options);
}
