import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CandidateList, CandidateItem, Skeleton } from './CandidateList.js';
import { AstryxThemeProvider } from '../../../components/astryx/index.js';

const mockCandidates: CandidateItem[] = [
  {
    id: 'cand-nondry-cache',
    title: "Consolidate Non-DRY Duplicate Logic for 'cache'",
    type: 'NON_DRY_DUPLICATION',
    domain: 'Architecture',
    description: "Multiple disparate implementations of 'cache' detected across packages. Violates Design OS Kernel DRY dogma and causes semantic drift.",
    recommendationStrength: 'Strong',
    files: [
      'packages/engine/src/cache/CacheManager.ts',
      'packages/engine/src/routing/cache-manager.ts'
    ],
    benefits: {
      locality: "Unifies scattered 'cache' implementations under an authoritative golden source module.",
      depth: 'Encapsulates complex caching algorithms behind an ergonomic, narrow interface.',
      leverage: 'Refactors and bug fixes propagate immediately to all callers without copy-pasting.'
    },
    beforeAfter: {
      beforeDiagram: 'flowchart TD\n  M0["packages/engine/src/cache/CacheManager.ts"]\n  M1["packages/engine/src/routing/cache-manager.ts"]',
      afterDiagram: 'flowchart TD\n  Golden["@superconductor/core/cache"]\n  Consumer0 --> Golden',
      beforeDescription: 'Duplicated implementations scattered in multiple directories.',
      afterDescription: 'Single deep golden source module reused across all callers.'
    },
    proposedTrack: {
      trackId: 'dry_consolidate_cache_20261001',
      title: 'Consolidate duplicate cache implementations',
      description: 'Refactor disparate cache modules into an authoritative, reusable core module.',
      filesAffected: [
        'packages/engine/src/cache/CacheManager.ts',
        'packages/engine/src/routing/cache-manager.ts'
      ]
    },
    couplingCluster: 'cluster-cache',
    estimatedTokenSavings: '14.2k'
  },
  {
    id: 'cand-shallow-parser',
    title: "Deepen or Inline Shallow Module 'parser'",
    type: 'SHALLOW_MODULE',
    domain: 'Core Engine',
    description: "'parser.ts' exhibits notable dependency surface but almost zero internal complexity. Interface is as complex as implementation.",
    recommendationStrength: 'Worth exploring',
    files: ['packages/engine/src/dag/parser.ts'],
    benefits: {
      locality: 'Collapses redundant abstraction layer directly into caller graph compiler.',
      depth: 'Eliminates passthrough methods that add cognitive load without adding value.',
      leverage: 'Removes 12 redundant unit tests that merely tested passthrough delegation.'
    },
    beforeAfter: {
      beforeDiagram: 'flowchart TD\n  Caller --> PassthroughParser\n  PassthroughParser --> RealEngine',
      afterDiagram: 'flowchart TD\n  Caller --> DeepEngine',
      beforeDescription: 'Shallow layer doing trivial 1:1 delegation.',
      afterDescription: 'Direct call into deep engine module.'
    },
    couplingCluster: 'cluster-dag-parser',
    estimatedTokenSavings: '6.5k'
  }
];

describe('CandidateList Component', () => {
  it('renders all candidates with title, domain badge, and recommendation strength', () => {
    render(
      <AstryxThemeProvider>
        <CandidateList candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    expect(screen.getByText("Consolidate Non-DRY Duplicate Logic for 'cache'")).toBeDefined();
    expect(screen.getByText("Deepen or Inline Shallow Module 'parser'")).toBeDefined();

    // Domain badges
    expect(screen.getByText('Architecture')).toBeDefined();
    expect(screen.getByText('Core Engine')).toBeDefined();

    // Recommendation badges
    expect(screen.getAllByText('Strong').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Worth exploring').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the list of affected files with monospace tags', () => {
    render(
      <AstryxThemeProvider>
        <CandidateList candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    expect(screen.getByText('Affected Files (2):')).toBeDefined();
    expect(screen.getByText('packages/engine/src/cache/CacheManager.ts')).toBeDefined();
    expect(screen.getByText('packages/engine/src/routing/cache-manager.ts')).toBeDefined();
    expect(screen.getByText('packages/engine/src/dag/parser.ts')).toBeDefined();
  });

  it('renders problem description and solution benefits (locality, depth, leverage)', () => {
    render(
      <AstryxThemeProvider>
        <CandidateList candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    // Problem description
    expect(
      screen.getByText(/Multiple disparate implementations of 'cache' detected across packages/i)
    ).toBeDefined();

    // Benefits labels
    const localityTitles = screen.getAllByText('Locality');
    expect(localityTitles.length).toBe(2);

    const depthTitles = screen.getAllByText('Depth');
    expect(depthTitles.length).toBe(2);

    const leverageTitles = screen.getAllByText('Leverage');
    expect(leverageTitles.length).toBe(2);

    // Specific benefit texts
    expect(
      screen.getByText("Unifies scattered 'cache' implementations under an authoritative golden source module.")
    ).toBeDefined();
    expect(
      screen.getByText('Collapses redundant abstraction layer directly into caller graph compiler.')
    ).toBeDefined();
  });

  it('renders side-by-side Before / After architecture visualizer with diagram blocks', () => {
    render(
      <AstryxThemeProvider>
        <CandidateList candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    const visualizers = screen.getAllByTestId('architecture-visualizer');
    expect(visualizers.length).toBe(2);

    const beforeHeaders = screen.getAllByText('BEFORE (Coupled / Redundant)');
    expect(beforeHeaders.length).toBe(2);

    const afterHeaders = screen.getAllByText('AFTER (Deep / Golden Source)');
    expect(afterHeaders.length).toBe(2);

    expect(
      screen.getByText(/M0\["packages\/engine\/src\/cache\/CacheManager\.ts"\]/)
    ).toBeDefined();
    expect(
      screen.getByText(/Golden\["@superconductor\/core\/cache"\]/)
    ).toBeDefined();

    expect(screen.getByText('Duplicated implementations scattered in multiple directories.')).toBeDefined();
    expect(screen.getByText('Single deep golden source module reused across all callers.')).toBeDefined();
  });

  it('toggles candidate selection when AstryxCheckbox is clicked', () => {
    const handleToggle = vi.fn();

    render(
      <AstryxThemeProvider>
        <CandidateList
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
          onToggleCandidate={handleToggle}
        />
      </AstryxThemeProvider>
    );

    const checkbox1 = screen.getByTestId('candidate-checkbox-cand-nondry-cache');
    const checkbox2 = screen.getByTestId('candidate-checkbox-cand-shallow-parser');

    expect(checkbox1.getAttribute('aria-checked')).toBe('true');
    expect(checkbox2.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(checkbox2);
    expect(handleToggle).toHaveBeenCalledWith('cand-shallow-parser');

    fireEvent.click(checkbox1);
    expect(handleToggle).toHaveBeenCalledWith('cand-nondry-cache');
  });

  it('filters candidates by recommendation strength button clicks', () => {
    render(
      <AstryxThemeProvider>
        <CandidateList candidates={mockCandidates} selectedCandidateIds={[]} />
      </AstryxThemeProvider>
    );

    // Initial state: all candidates shown
    expect(screen.getByText("Consolidate Non-DRY Duplicate Logic for 'cache'")).toBeDefined();
    expect(screen.getByText("Deepen or Inline Shallow Module 'parser'")).toBeDefined();

    // Click 'Strong' filter button
    const filterButtons = screen.getAllByRole('button');
    const strongFilter = filterButtons.find((btn) => btn.textContent === 'Strong');
    expect(strongFilter).toBeDefined();
    fireEvent.click(strongFilter!);

    expect(screen.getByText("Consolidate Non-DRY Duplicate Logic for 'cache'")).toBeDefined();
    expect(screen.queryByText("Deepen or Inline Shallow Module 'parser'")).toBeNull();

    // Click 'Worth exploring' filter button
    const exploringFilter = filterButtons.find((btn) => btn.textContent === 'Worth exploring');
    expect(exploringFilter).toBeDefined();
    fireEvent.click(exploringFilter!);

    expect(screen.queryByText("Consolidate Non-DRY Duplicate Logic for 'cache'")).toBeNull();
    expect(screen.getByText("Deepen or Inline Shallow Module 'parser'")).toBeDefined();

    // Reset to 'All'
    const allFilter = filterButtons.find((btn) => btn.textContent === 'All');
    expect(allFilter).toBeDefined();
    fireEvent.click(allFilter!);

    expect(screen.getByText("Consolidate Non-DRY Duplicate Logic for 'cache'")).toBeDefined();
    expect(screen.getByText("Deepen or Inline Shallow Module 'parser'")).toBeDefined();
  });

  it('supports Select All and Clear callbacks', () => {
    const handleSelectAll = vi.fn();
    const handleClear = vi.fn();

    render(
      <AstryxThemeProvider>
        <CandidateList
          candidates={mockCandidates}
          selectedCandidateIds={['cand-nondry-cache']}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClear}
        />
      </AstryxThemeProvider>
    );

    const selectAllBtn = screen.getByRole('button', { name: 'Select All' });
    fireEvent.click(selectAllBtn);
    expect(handleSelectAll).toHaveBeenCalledTimes(1);

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('renders Skeleton loading state without crashing', () => {
    const { container } = render(<Skeleton className="custom-skeleton" />);
    expect(container.querySelector('.astryx-skeleton')).toBeDefined();
  });
});
