import { Project, SyntaxKind, type Node } from 'ts-morph';

export type TextDirection = 'ltr' | 'rtl';

export interface SetLocaleResult {
  direction: TextDirection;
  isRtl: boolean;
}

/**
 * Standard RTL ISO language codes (ISO 639-1 / 639-2 / 639-3).
 */
const RTL_LANGUAGE_CODES = new Set([
  'ar',  // Arabic
  'arc', // Aramaic
  'azb', // South Azerbaijani
  'ckb', // Sorani Kurdish
  'dv',  // Divehi
  'fa',  // Persian / Farsi
  'he',  // Hebrew
  'iw',  // Hebrew (legacy ISO 639-1)
  'ji',  // Yiddish (legacy ISO 639-1)
  'khw', // Khowar
  'ks',  // Kashmiri
  'ku',  // Kurdish
  'ps',  // Pashto
  'sd',  // Sindhi
  'syr', // Syriac
  'ug',  // Uyghur
  'ur',  // Urdu
  'yi',  // Yiddish
]);

/**
 * LocaleMirrorHarness simulates multi-language and bidirectional LTR/RTL layout mirroring.
 * Provides upfront internationalization stress-testing:
 * - Direction detection (LTR vs RTL) for Arabic, Hebrew, Farsi, Urdu, etc.
 * - Text expansion simulation (+30% to +40% longer German/French copy) to test container clipping and line breaks.
 * - In-DOM I18n wrapper generation with dir and lang attributes.
 * - Static string detection from JSX children to highlight untranslated UI copy.
 */
export class LocaleMirrorHarness {
  public activeLocale: string;
  public activeDirection: TextDirection;

  private static projectInstance?: Project;

  constructor(initialLocale: string = 'en') {
    this.activeLocale = initialLocale;
    this.activeDirection = LocaleMirrorHarness.isRtlLocale(initialLocale) ? 'rtl' : 'ltr';
  }

  /**
   * Checks whether a given locale string corresponds to a Right-to-Left (RTL) script.
   */
  public static isRtlLocale(locale: string): boolean {
    if (!locale || typeof locale !== 'string') {
      return false;
    }
    const normalized = locale.trim().toLowerCase().split(/[-_]/)[0];
    return RTL_LANGUAGE_CODES.has(normalized);
  }

  /**
   * Lazily initializes an in-memory ts-morph Project for JSX AST analysis.
   */
  private static getProject(): Project {
    if (!LocaleMirrorHarness.projectInstance) {
      LocaleMirrorHarness.projectInstance = new Project({
        useInMemoryFileSystem: true,
        skipAddingFilesFromTsConfig: true,
        compilerOptions: {
          jsx: 1, // JsxEmit.Preserve
          allowJs: true,
        },
      });
    }
    return LocaleMirrorHarness.projectInstance;
  }

  /**
   * Updates the active locale and automatically computes direction ('ltr' or 'rtl').
   */
  public setLocale(locale: string): SetLocaleResult {
    const isRtl = LocaleMirrorHarness.isRtlLocale(locale);
    this.activeLocale = locale;
    this.activeDirection = isRtl ? 'rtl' : 'ltr';

    return {
      direction: this.activeDirection,
      isRtl,
    };
  }

  /**
   * Simulates European language text expansion (+30% to +40% longer string e.g. German/French)
   * to stress-test UI containers against clipping and line breaks.
   *
   * @param text The source text string
   * @param multiplier The expansion multiplier (e.g. 1.35 for +35%, or 0.35). Defaults to 1.35.
   */
  public simulateTextExpansion(text: string, multiplier: number = 1.35): string {
    if (!text || text.length === 0) {
      return text;
    }

    const factor = multiplier < 1 ? 1 + multiplier : multiplier;
    if (factor <= 1) {
      return text;
    }

    const targetLength = Math.max(text.length, Math.ceil(text.length * factor));
    const diff = targetLength - text.length;
    if (diff <= 0) {
      return text;
    }

    if (diff === 1) {
      return `${text}ä`;
    }

    const pattern = ' äöüß-éèêë-Erweiterung';
    let filler = '';
    while (filler.length < diff) {
      filler += pattern;
    }

    return text + filler.slice(0, diff);
  }

  /**
   * Wraps preview DOM with `<div dir="${direction}" lang="${locale}">...</div>`.
   *
   * @param componentSource JSX or HTML markup string
   * @param locale Optional locale to wrap with. Defaults to activeLocale.
   */
  public wrapInI18nProvider(componentSource: string, locale?: string): string {
    const targetLocale = locale || this.activeLocale;
    const direction = LocaleMirrorHarness.isRtlLocale(targetLocale) ? 'rtl' : 'ltr';
    return `<div dir="${direction}" lang="${targetLocale}">${componentSource}</div>`;
  }

  /**
   * Detects hardcoded user-facing text strings in JSX children to flag localization opportunities.
   *
   * @param jsxSnippet JSX / TSX code snippet
   */
  public extractStaticStrings(jsxSnippet: string): string[] {
    if (!jsxSnippet || typeof jsxSnippet !== 'string' || !jsxSnippet.trim()) {
      return [];
    }

    try {
      return this.extractFromAst(jsxSnippet);
    } catch {
      return this.extractWithRegex(jsxSnippet);
    }
  }

  private extractFromAst(jsxSnippet: string): string[] {
    const project = LocaleMirrorHarness.getProject();
    const fileName = `snippet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.tsx`;
    const sourceFile = project.createSourceFile(fileName, jsxSnippet, { overwrite: true });

    const results: string[] = [];

    try {
      sourceFile.forEachDescendant((node) => {
        if (this.isInsideIgnoredTag(node)) {
          return;
        }

        const kind = node.getKind();

        if (kind === SyntaxKind.JsxText) {
          const raw = node.getText();
          const trimmed = raw.trim();
          if (trimmed.length > 0) {
            results.push(trimmed);
          }
        } else if (kind === SyntaxKind.JsxExpression) {
          const parent = node.getParent();
          if (parent && (parent.getKind() === SyntaxKind.JsxElement || parent.getKind() === SyntaxKind.JsxFragment)) {
            const expr = (node as any).getExpression?.();
            if (expr) {
              const exprKind = expr.getKind();
              if (exprKind === SyntaxKind.StringLiteral || exprKind === SyntaxKind.NoSubstitutionTemplateLiteral) {
                const text = typeof expr.getLiteralText === 'function'
                  ? expr.getLiteralText()
                  : expr.getText().slice(1, -1);
                const trimmed = text.trim();
                if (trimmed.length > 0) {
                  results.push(trimmed);
                }
              }
            }
          }
        }
      });
    } finally {
      project.removeSourceFile(sourceFile);
    }

    return results;
  }

  private isInsideIgnoredTag(node: Node): boolean {
    let current: Node | undefined = node.getParent();
    while (current) {
      const tagName = this.getTagName(current);
      if (tagName === 'style' || tagName === 'script') {
        return true;
      }
      current = current.getParent();
    }
    return false;
  }

  private getTagName(node: Node | undefined): string {
    if (!node) return '';
    if (node.getKind() === SyntaxKind.JsxElement) {
      const opening = (node as any).getOpeningElement?.();
      return opening?.getTagNameNode?.()?.getText()?.toLowerCase() || '';
    }
    if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
      return (node as any).getTagNameNode?.()?.getText()?.toLowerCase() || '';
    }
    return '';
  }

  private extractWithRegex(snippet: string): string[] {
    const clean = snippet
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');

    const results: string[] = [];
    const tagContentRegex = />([^<]+)</g;
    let match: RegExpExecArray | null;
    while ((match = tagContentRegex.exec(clean)) !== null) {
      const content = match[1];
      const stripped = content.replace(/\{[^}]*\}/g, '').trim();
      if (stripped.length > 0) {
        results.push(stripped);
      }
    }
    return results;
  }
}
