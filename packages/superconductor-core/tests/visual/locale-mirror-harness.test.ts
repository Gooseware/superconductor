import { describe, it, expect, beforeEach } from 'vitest';
import { LocaleMirrorHarness } from '../../src/visual/locale-mirror-harness.js';

describe('LocaleMirrorHarness', () => {
  let harness: LocaleMirrorHarness;

  beforeEach(() => {
    harness = new LocaleMirrorHarness();
  });

  describe('Properties and Initialization', () => {
    it('initializes with default locale "en" and direction "ltr"', () => {
      expect(harness.activeLocale).toBe('en');
      expect(harness.activeDirection).toBe('ltr');
    });

    it('initializes with custom RTL locale when provided to constructor', () => {
      const rtlHarness = new LocaleMirrorHarness('ar');
      expect(rtlHarness.activeLocale).toBe('ar');
      expect(rtlHarness.activeDirection).toBe('rtl');
    });
  });

  describe('RTL and LTR Language Detection (setLocale)', () => {
    it('detects Arabic (ar) as RTL', () => {
      const result = harness.setLocale('ar');
      expect(result).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.activeLocale).toBe('ar');
      expect(harness.activeDirection).toBe('rtl');
    });

    it('detects Hebrew (he) as RTL', () => {
      const result = harness.setLocale('he');
      expect(result).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.activeLocale).toBe('he');
      expect(harness.activeDirection).toBe('rtl');
    });

    it('detects regional Arabic and Hebrew locales as RTL', () => {
      expect(harness.setLocale('ar-SA')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('ar-EG')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('he-IL')).toEqual({ direction: 'rtl', isRtl: true });
    });

    it('detects other RTL languages (fa, ur, yi, ps, ug)', () => {
      expect(harness.setLocale('fa')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('fa-IR')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('ur')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('ur-PK')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('yi')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('ps')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('ug')).toEqual({ direction: 'rtl', isRtl: true });
    });

    it('handles case-insensitivity in locale tags', () => {
      expect(harness.setLocale('AR')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('He-il')).toEqual({ direction: 'rtl', isRtl: true });
      expect(harness.setLocale('FA_IR')).toEqual({ direction: 'rtl', isRtl: true });
    });

    it('detects standard LTR languages (en, de, fr, ja, es, zh)', () => {
      expect(harness.setLocale('en')).toEqual({ direction: 'ltr', isRtl: false });
      expect(harness.setLocale('de')).toEqual({ direction: 'ltr', isRtl: false });
      expect(harness.setLocale('fr')).toEqual({ direction: 'ltr', isRtl: false });
      expect(harness.setLocale('ja')).toEqual({ direction: 'ltr', isRtl: false });
      expect(harness.setLocale('es')).toEqual({ direction: 'ltr', isRtl: false });
      expect(harness.setLocale('zh-CN')).toEqual({ direction: 'ltr', isRtl: false });
    });

    it('static isRtlLocale helper works reliably', () => {
      expect(LocaleMirrorHarness.isRtlLocale('ar')).toBe(true);
      expect(LocaleMirrorHarness.isRtlLocale('he')).toBe(true);
      expect(LocaleMirrorHarness.isRtlLocale('en')).toBe(false);
      expect(LocaleMirrorHarness.isRtlLocale('')).toBe(false);
      expect(LocaleMirrorHarness.isRtlLocale(null as any)).toBe(false);
    });
  });

  describe('Text Expansion Simulation (simulateTextExpansion)', () => {
    it('expands text with default multiplier (~35% expansion)', () => {
      const original = 'Save changes';
      const expanded = harness.simulateTextExpansion(original);

      expect(expanded.length).toBeGreaterThan(original.length);
      expect(expanded.length).toBe(Math.ceil(original.length * 1.35));
      expect(expanded.startsWith(original)).toBe(true);
      // Contains European diacritics/characters
      expect(/[äöüßéèêë]/.test(expanded)).toBe(true);
    });

    it('respects custom multiplier (e.g. 1.4 for +40% expansion)', () => {
      const original = 'Submit form';
      const expanded = harness.simulateTextExpansion(original, 1.4);

      expect(expanded.length).toBe(Math.ceil(original.length * 1.4));
      expect(expanded.startsWith(original)).toBe(true);
    });

    it('respects fractional addition multiplier (e.g. 0.3 for +30% expansion)', () => {
      const original = 'Preferences';
      const expanded = harness.simulateTextExpansion(original, 0.3);

      expect(expanded.length).toBe(Math.ceil(original.length * 1.3));
      expect(expanded.startsWith(original)).toBe(true);
    });

    it('handles single character or small diff expansion without truncation', () => {
      const original = 'Hi';
      const expanded = harness.simulateTextExpansion(original, 1.35);

      expect(expanded.length).toBe(Math.ceil(original.length * 1.35));
      expect(expanded.startsWith(original)).toBe(true);
    });

    it('returns empty string when given empty input', () => {
      expect(harness.simulateTextExpansion('')).toBe('');
    });

    it('returns original string when multiplier is <= 1', () => {
      expect(harness.simulateTextExpansion('Hello', 1.0)).toBe('Hello');
      expect(harness.simulateTextExpansion('Hello', 0.0)).toBe('Hello');
    });
  });

  describe('I18n Provider Wrapper (wrapInI18nProvider)', () => {
    it('wraps component in div with default dir="ltr" and lang="en"', () => {
      const wrapped = harness.wrapInI18nProvider('<button>Click</button>');
      expect(wrapped).toBe('<div dir="ltr" lang="en"><button>Click</button></div>');
    });

    it('wraps component with dir="rtl" when explicit RTL locale is passed', () => {
      const wrapped = harness.wrapInI18nProvider('<UserProfile />', 'ar');
      expect(wrapped).toBe('<div dir="rtl" lang="ar"><UserProfile /></div>');
    });

    it('wraps component with dir="rtl" when Hebrew is the active locale', () => {
      harness.setLocale('he');
      const wrapped = harness.wrapInI18nProvider('<h1>שלום</h1>');
      expect(wrapped).toBe('<div dir="rtl" lang="he"><h1>שלום</h1></div>');
    });

    it('wraps component with dir="ltr" for German locale', () => {
      const wrapped = harness.wrapInI18nProvider('<div>Hallo</div>', 'de');
      expect(wrapped).toBe('<div dir="ltr" lang="de"><div>Hallo</div></div>');
    });
  });

  describe('Static String Extraction (extractStaticStrings)', () => {
    it('extracts simple text from JSX children', () => {
      const snippet = '<h1>Welcome to Superconductor</h1>';
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual(['Welcome to Superconductor']);
    });

    it('extracts multiple children in document order', () => {
      const snippet = `
        <div>
          <h1>Dashboard</h1>
          <p>Manage your account settings.</p>
          <button>Save Changes</button>
        </div>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual([
        'Dashboard',
        'Manage your account settings.',
        'Save Changes',
      ]);
    });

    it('extracts nested element strings', () => {
      const snippet = `
        <section>
          <h2>Profile Details</h2>
          <div>
            <label>Full Name</label>
            <span>Required</span>
          </div>
        </section>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual([
        'Profile Details',
        'Full Name',
        'Required',
      ]);
    });

    it('ignores JSX attributes and only extracts JSX children', () => {
      const snippet = `
        <button
          className="btn-primary"
          title="Click to submit"
          aria-label="Submit button"
          onClick={() => {}}
        >
          Submit
        </button>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual(['Submit']);
    });

    it('returns empty array when element has no text children (e.g. input with attributes)', () => {
      const snippet = '<input type="text" placeholder="Enter email" title="Email" />';
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual([]);
    });

    it('extracts static string literals from JSX expression containers in children', () => {
      const snippet = `
        <div>
          {'Static text literal'}
          <p>Normal text</p>
        </div>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual([
        'Static text literal',
        'Normal text',
      ]);
    });

    it('ignores JSX comments and extracts surrounding text', () => {
      const snippet = `
        <div>
          {/* This is an internal comment */}
          <span>Visible Label</span>
        </div>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual(['Visible Label']);
    });

    it('ignores <style> and <script> contents', () => {
      const snippet = `
        <div>
          <style>{'.banner { font-size: 16px; }'}</style>
          <h1>Actual Title</h1>
          <script>console.log("ignore me");</script>
        </div>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual(['Actual Title']);
    });

    it('extracts non-Latin RTL text strings', () => {
      const snippet = `
        <div dir="rtl">
          <h1>مرحبا بك في سوبركوندكتور</h1>
          <button>حفظ</button>
        </div>
      `;
      const strings = harness.extractStaticStrings(snippet);
      expect(strings).toEqual([
        'مرحبا بك في سوبركوندكتور',
        'حفظ',
      ]);
    });

    it('handles empty or whitespace snippets safely', () => {
      expect(harness.extractStaticStrings('')).toEqual([]);
      expect(harness.extractStaticStrings('   \n  \t ')).toEqual([]);
      expect(harness.extractStaticStrings(null as any)).toEqual([]);
    });
  });
});
