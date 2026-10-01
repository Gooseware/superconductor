import { describe, it, expect } from 'vitest';
import { SHENANIGAN_CHECKLIST, buildReviewerSystemPrompt } from '../../src/agents/reviewer-system-prompt.js';
import {
  checkComponentReinvention,
  extractFamily,
} from '../../../../skills/adversarial-reviewer/shenanigans/09-component-reinvention.js';
import {
  SHENANIGAN_09_NAME,
  SHENANIGAN_09_DESCRIPTION,
  buildAdversarialDryReviewerPrompt,
} from '../../../../skills/adversarial-reviewer/prompts.js';

describe('Adversarial Quorum DRY Reviewer: Shenanigan #9 Enforcement', () => {
  describe('SHENANIGAN_CHECKLIST Integration', () => {
    it('includes Component Reinvention & Non-DRY Redundancy in SHENANIGAN_CHECKLIST', () => {
      const dryItem = SHENANIGAN_CHECKLIST.find((item) =>
        item.includes('Component Reinvention & Non-DRY Redundancy')
      );
      expect(dryItem).toBeDefined();
      expect(dryItem).toContain(
        'hand-rolling custom primitives, components, or helper functions that duplicate existing code'
      );
    });

    it('buildReviewerSystemPrompt bakes Shenanigan #9 into generated reviewer prompt', () => {
      const prompt = buildReviewerSystemPrompt('Base reviewer prompt');
      expect(prompt).toContain('Component Reinvention & Non-DRY Redundancy');
      expect(prompt).toContain('Failure to check all 9 items is itself a Critical finding');
    });

    it('prompts.ts exports canonical Shenanigan #9 constants', () => {
      expect(SHENANIGAN_09_NAME).toBe('Component Reinvention & Non-DRY Redundancy');
      expect(SHENANIGAN_09_DESCRIPTION).toContain('hand-rolling custom primitives');
      const dryPrompt = buildAdversarialDryReviewerPrompt('Initial prompt');
      expect(dryPrompt).toContain('Component Reinvention & Non-DRY Redundancy');
      expect(dryPrompt).toContain('NEEDS_FIXES');
    });
  });

  describe('extractFamily semantic classifier', () => {
    it('classifies UI primitives into normalized families', () => {
      expect(extractFamily('AstryxButton')).toBe('button');
      expect(extractFamily('CustomButton')).toBe('button');
      expect(extractFamily('AstryxCard')).toBe('card');
      expect(extractFamily('ReportCard')).toBe('card');
      expect(extractFamily('AstryxCheckbox')).toBe('checkbox');
      expect(extractFamily('TextInput')).toBe('input');
      expect(extractFamily('ConfirmationModal')).toBe('modal');
      expect(extractFamily('DataTable')).toBe('table');
    });

    it('classifies helper functions into normalized families', () => {
      expect(extractFamily('deepClone')).toBe('cloner');
      expect(extractFamily('cloneObject')).toBe('cloner');
      expect(extractFamily('SimpleCache')).toBe('cache');
      expect(extractFamily('formatDate')).toBe('formatter');
      expect(extractFamily('tokenize')).toBe('token');
      expect(extractFamily('debounce')).toBe('debouncer');
    });

    it('avoids substring collisions on non-component identifiers (REV-2)', () => {
      // Substring collisions that previously falsely matched
      expect(extractFamily('discard')).toBeNull();
      expect(extractFamily('wildcard')).toBeNull();
      expect(extractFamily('isStable')).toBeNull();
      expect(extractFamily('selectable')).toBeNull();
      expect(extractFamily('selectAll')).toBeNull();
      expect(extractFamily('selectNone')).toBeNull();
      expect(extractFamily('selectRow')).toBeNull();
    });
  });

  describe('checkComponentReinvention diff analysis', () => {
    it('returns PASS for clean diff reusing existing components without reinvention', () => {
      const diff = `
diff --git a/packages/superconductor-ui/src/apps/architecture-report/App.tsx b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
--- a/packages/superconductor-ui/src/apps/architecture-report/App.tsx
+++ b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
@@ -1,5 +1,12 @@
+import React from 'react';
+import { AstryxCard, AstryxButton, AstryxCheckbox } from '@superconductor/ui';
+
+export function ArchitectureReportView() {
+  return (
+    <AstryxCard title="Report">
+      <AstryxCheckbox label="Select" />
+      <AstryxButton label="Generate Tracks" />
+    </AstryxCard>
+  );
+}
`;

      const result = checkComponentReinvention(diff, {
        reuses: ['AstryxCard', 'AstryxButton', 'AstryxCheckbox'],
        registryItems: ['AstryxCard', 'AstryxButton', 'AstryxCheckbox'],
        symbolCatalog: ['ArchitectureReportView'],
      });

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.findings).toHaveLength(0);
    });

    it('flags hand-rolled custom UI component duplicating registered Golden Source component', () => {
      const diff = `
diff --git a/packages/superconductor-ui/src/components/MyCard.tsx b/packages/superconductor-ui/src/components/MyCard.tsx
new file mode 100644
--- /dev/null
+++ b/packages/superconductor-ui/src/components/MyCard.tsx
@@ -0,0 +1,8 @@
+export function CustomCard({ title, children }: any) {
+  return (
+    <div className="custom-card-container">
+      <h2>{title}</h2>
+      {children}
+    </div>
+  );
+}
`;

      const result = checkComponentReinvention(diff, {
        registryItems: ['AstryxCard', 'AstryxButton'],
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('NEEDS_FIXES');
      expect(result.findings.length).toBeGreaterThan(0);

      const finding = result.findings[0];
      expect(finding.severity).toBe('high');
      expect(finding.category).toBe('adversarial');
      expect(finding.shenanigan).toBe('component-reinvention');
      expect(finding.is_security_critical).toBe(false);
      expect(finding.description).toContain('Component Reinvention / Non-DRY Redundancy');
      expect(finding.description).toContain('CustomCard');
      expect(finding.description).toContain('AstryxCard');
      expect(finding.recommendation).toContain('AstryxCard');
    });

    it('flags hand-rolled helper functions duplicating repository symbol catalog', () => {
      const diff = `
diff --git a/src/utils/cloner.ts b/src/utils/cloner.ts
--- a/src/utils/cloner.ts
+++ b/src/utils/cloner.ts
@@ -10,3 +10,7 @@
+export function deepClone<T>(obj: T): T {
+  return JSON.parse(JSON.stringify(obj));
+}
`;

      const result = checkComponentReinvention(diff, {
        symbolCatalog: ['deepClone', 'formatDate'],
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('NEEDS_FIXES');
      expect(result.findings.length).toBeGreaterThan(0);

      const finding = result.findings[0];
      expect(finding.severity).toBe('high');
      expect(finding.category).toBe('adversarial');
      expect(finding.shenanigan).toBe('component-reinvention');
      expect(finding.description).toContain('Component Reinvention / Non-DRY Redundancy');
      expect(finding.description).toContain('deepClone');
    });

    it('flags diff that ignores declared REUSES tags and hand-rolls custom buttons', () => {
      const diff = `
diff --git a/packages/superconductor-ui/src/apps/architecture-report/App.tsx b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
--- a/packages/superconductor-ui/src/apps/architecture-report/App.tsx
+++ b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
@@ -5,4 +5,8 @@
+export const MyActionButton = (props: any) => {
+  return <button className="custom-btn" onClick={props.onClick}>{props.label}</button>;
+};
`;

      const result = checkComponentReinvention(diff, {
        reuses: ['AstryxButton', 'AstryxCard'],
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('NEEDS_FIXES');
      expect(result.findings.some((f) => f.duplicateOf === 'AstryxButton')).toBe(true);
      const finding = result.findings.find((f) => f.duplicateOf === 'AstryxButton')!;
      expect(finding.severity).toBe('high');
      expect(finding.category).toBe('adversarial');
      expect(finding.shenanigan).toBe('component-reinvention');
      expect(finding.description).toContain('Component Reinvention / Non-DRY Redundancy');
    });

    it('flags ignored REUSES when diff introduces raw HTML markup without using declared component', () => {
      const diff = `
diff --git a/packages/superconductor-ui/src/apps/architecture-report/App.tsx b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
--- a/packages/superconductor-ui/src/apps/architecture-report/App.tsx
+++ b/packages/superconductor-ui/src/apps/architecture-report/App.tsx
@@ -20,4 +20,9 @@
+export function Controls() {
+  return (
+    <div className="controls">
+      <input type="checkbox" id="check-all" />
+    </div>
+  );
+}
`;

      const result = checkComponentReinvention(diff, {
        reuses: ['AstryxCheckbox'],
      });

      expect(result.passed).toBe(false);
      expect(result.status).toBe('NEEDS_FIXES');
      expect(result.findings.some((f) => f.duplicateOf === 'AstryxCheckbox')).toBe(true);
      const finding = result.findings.find((f) => f.duplicateOf === 'AstryxCheckbox')!;
      expect(finding.description).toContain('ignores declared REUSES item');
    });

    it('does not flag diff when family words only appear inside comment lines (REV-2)', () => {
      const diff = `
diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,4 +10,10 @@
 export function setup() {
+  // TODO: Add card layout once ready
+  /* table data rendering note */
+  # button styling reminder
+  <!-- modal preview placeholder -->
+  const x = 42;
+  return x;
 }
`;
      const result = checkComponentReinvention(diff, {
        reuses: ['AstryxCard', 'AstryxTable', 'AstryxButton', 'AstryxModal'],
      });

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.findings).toHaveLength(0);
    });

    it('does not trigger false-positive REUSES violations for substring matches like discard, wildcard, isStable, selectable', () => {
      const diff = `
diff --git a/src/utils/filter.ts b/src/utils/filter.ts
--- a/src/utils/filter.ts
+++ b/src/utils/filter.ts
@@ -5,6 +5,10 @@
 export function processItems(items: string[]) {
+  const discard = items.filter((x) => x.startsWith('drop'));
+  const wildcard = items.find((x) => x.includes('*'));
+  const isStable = items.length > 0;
+  const selectable = items.map((x) => ({ name: x, canSelect: true }));
+  return { discard, wildcard, isStable, selectable };
 }
`;
      const result = checkComponentReinvention(diff, {
        reuses: ['AstryxCard', 'AstryxTable'],
      });

      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.findings).toHaveLength(0);
    });

    it('handles empty diff gracefully', () => {
      const result = checkComponentReinvention('');
      expect(result.passed).toBe(true);
      expect(result.status).toBe('PASS');
      expect(result.findings).toHaveLength(0);
    });
  });
});
